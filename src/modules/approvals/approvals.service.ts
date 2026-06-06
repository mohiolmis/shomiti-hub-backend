import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {PrismaService} from '../../prisma/prisma.service';
import {ApprovalType, GetApprovalsDto} from './dto/get-appovals.dto';
import {ApproveRejectDto} from './dto/approve-reject.dto';
import {CreateApprovalDto} from './dto/create-approval.dto';
import {Prisma} from '@prisma/client';

@Injectable()
export class ApprovalsService {
  constructor(private prisma: PrismaService) {}

  // Get
  async getApprovals(somiteeId: number, query: GetApprovalsDto) {
    try {
      const {status = 'pending', type, createdBy, page = 1, limit = 20} = query;

      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {
        somiteeId: BigInt(somiteeId),
      };

      // ======================
      // FILTERS
      // ======================
      if (status !== 'all') where.status = status;
      if (type) where.type = type;
      if (createdBy) where.createdById = Number(createdBy);

      // ======================
      // MAIN QUERY
      // ======================
      const [approvals, total, paymentAgg, expenseAgg, bankAgg, memberTotal, pendingMembers] =
        await Promise.all([
          this.prisma.approval.findMany({
            where,
            include: {
              createdBy: {select: {id: true, name: true}},
              reviewedBy: {select: {id: true, name: true}},
            },
            orderBy: {createdAt: 'desc'},
            skip,
            take: Number(limit),
          }),

          this.prisma.approval.count({where}),

          // ======================
          // TOTAL COLLECTION
          // ======================
          this.prisma.payment.aggregate({
            where: {
              somiteeId: BigInt(somiteeId),
              status: 'approved',
            },
            _sum: {amount: true},
          }),

          // ======================
          // TOTAL EXPENSE
          // ======================
          this.prisma.expense.aggregate({
            where: {
              somiteeId: BigInt(somiteeId),
              status: 'approved',
            },
            _sum: {amount: true},
          }),

          // ======================
          // BANK TRANSACTION
          // ======================
          this.prisma.bankTransaction.aggregate({
            where: {
              somiteeId: BigInt(somiteeId),
            },
            _sum: {amount: true},
          }),

          // ======================
          // TOTAL MEMBERS
          // ======================
          this.prisma.memberRequest.count({
            where: {
              somiteeId: BigInt(somiteeId),
              status: 'approved',
            },
          }),

          // ======================
          // PENDING MEMBERS
          // ======================
          this.prisma.memberRequest.count({
            where: {
              somiteeId: BigInt(somiteeId),
              status: 'pending',
            },
          }),
        ]);

      // ======================
      // STATUS COUNTS
      // ======================
      const counts = await this.prisma.approval.groupBy({
        by: ['status'],
        where: {
          somiteeId: BigInt(somiteeId),
        },
        _count: true,
      });

      const statusCounts = {
        pending: 0,
        approved: 0,
        rejected: 0,
      };

      counts.forEach((c: any) => {
        statusCounts[c.status as keyof typeof statusCounts] = c._count;
      });

      // ======================
      // RESPONSE
      // ======================
      return {
        data: approvals,

        totalCollection: paymentAgg?._sum?.amount ?? 0,
        totalExpense: expenseAgg?._sum?.amount ?? 0,
        bankTransaction: bankAgg?._sum?.amount ?? 0,

        totalMembers: memberTotal,
        pendingMembers: pendingMembers,

        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('approvals.service.getApprovals error:', {
          message: error.message,
          stack: error.stack,
          somiteeId,
          query,
        });
      } else {
        console.error('approvals.service.getApprovals unknown error:', error);
      }

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to getApprovals');
    }
  }

  async getApproval(id: number, somiteeId: number) {
    try {
      const approval = await this.prisma.approval.findFirst({
        where: {id, somiteeId},
        include: {
          createdBy: {select: {id: true, name: true}},
          reviewedBy: {select: {id: true, name: true}},
        },
      });
      if (!approval) {
        throw new NotFoundException('Approval not found');
      }
      return approval;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('approvals.service.service.getApproval error:', {
          message: error.message,
          stack: error.stack,
          id: id,
          somiteeId: somiteeId,
        });
      } else {
        console.error('approvals.service.service.getApproval unknown error:', error);
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to getApproval');
    }
  }

  async createApproval(
    dto: CreateApprovalDto,
    userId: number,
    userName: string,
    somiteeId: number,
  ) {
    try {
      const permissionMap: Record<ApprovalType, string> = {
        collection: 'collection.create',
        expense: 'expense.create',
        bank: 'bank.create',
        member: 'member.create',
      };

      const requiredPermission = permissionMap[dto.type];

      if (!requiredPermission) {
        throw new BadRequestException('Invalid approval type');
      }

      const hasPermission = await this.checkUserPermission(userId, requiredPermission);

      if (!hasPermission) {
        throw new ForbiddenException(`Missing permission: ${requiredPermission}`);
      }

      const user = await this.prisma.user.findUnique({
        where: {id: userId},
        select: {name: true},
      });

      const createdByName = user?.name ?? 'Unknown User';

      return await this.prisma.approval.create({
        data: {
          type: dto.type,
          title: dto.title,
          amount: dto.amount,
          description: dto.description,
          payload: dto.payload,

          createdById: BigInt(userId), // ✅ FIX
          createdByName: createdByName,

          somiteeId: BigInt(somiteeId), // ✅ FIX
        },
      });
    } catch (error: unknown) {
      console.error('approvals.createApproval error:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to createApproval');
    }
  }

  async approveApproval(
    id: number,
    dto: ApproveRejectDto,
    reviewerId: number,
    reviewerName: string,
    somiteeId: number,
  ) {
    const approval = await this.prisma.approval.findFirst({
      where: {
        id: BigInt(id),
        somiteeId: BigInt(somiteeId),
      },
    });

    console.log('approvals.service.dto:', dto);

    if (!approval) {
      throw new NotFoundException('Approval not found');
    }

    if (approval.status !== 'pending') {
      throw new BadRequestException(`Already ${approval.status}`);
    }

    const permissionMap: Record<string, string> = {
      collection: 'collection.approve',
      expense: 'expense.approve',
      bank: 'bank.approve',
      member: 'member.approve',
      income: 'income.approve',
    };

    const permission = permissionMap[approval.type];

    const hasPermission = await this.checkUserPermission(reviewerId, permission);

    if (!hasPermission) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }

    if (dto.status === 'approved') {
      if (approval.type === 'expense') {
        return this.processExpenseApproval(approval, reviewerId);
      } else if (approval.type === 'collection') {
        return this.processApproval(approval, reviewerId, reviewerName, dto.note);
      } else if (approval.type === 'income') {
        return this.processIncomeApproval(approval, reviewerId, reviewerName, dto.note);
      }
    }

    return this.processReject(approval, reviewerId, reviewerName, dto.note);
  }

  private async processApproval(
    approval: any,
    reviewerId: number,
    reviewerName: string,
    note?: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. FIND EXISTING PAYMENT
        const payment = await tx.payment.findFirst({
          where: {
            id: approval.payload.paymentId, // IMPORTANT
          },
        });

        if (!payment) {
          throw new NotFoundException('Payment not found for approval');
        }

        // 2. UPDATE PAYMENT STATUS
        const updatedPayment = await tx.payment.update({
          where: {id: payment.id},
          data: {
            status: 'approved',
          },
        });

        // 3. CREATE TRANSACTION
        const transaction = await this.createTransaction(tx, approval, payment);

        // 4. LEDGER
        await this.createLedger(tx, approval, transaction.id);

        // 5. CASHBOOK
        await this.createCashbook(tx, approval, transaction.id);

        // 6. BANK TRANSACTION
        await this.createBankTransaction(tx, approval, transaction.id);

        // 7. UPDATE APPROVAL
        const updatedApproval = await tx.approval.update({
          where: {
            id: approval.id,
          },
          data: {
            status: 'approved',
            rejectionNote: note, // ✅ FIXED
            reviewedById: BigInt(reviewerId),
            reviewedByName: reviewerName,
            reviewedAt: new Date(),
          },
        });

        return updatedApproval;
      });
    } catch (error) {
      console.error('processApproval error =>', error);
      throw error;
    }
  }

  private async createCashbook(tx: Prisma.TransactionClient, approval: any, transactionId: bigint) {
    return tx.cashBookEntry.create({
      data: {
        somiteeId: approval.somiteeId,
        date: new Date(),
        description: 'Collection Approved',
        cashIn: approval.amount,
        cashOut: 0,
        balance: 0,
        referenceType: 'transaction',
        referenceId: String(transactionId),
        createdById: approval.createdById,
      },
    });
  }

  private async createTransaction(tx: Prisma.TransactionClient, approval: any, payment: any) {
    return tx.transaction.create({
      data: {
        somitee: {
          connect: {id: approval.somiteeId},
        },

        member: approval.payload?.memberId
          ? {
              connect: {id: approval.payload.memberId},
            }
          : undefined,

        memberName: approval.payload?.memberName ?? null,

        type: 'collection',
        amount: approval.amount,
        date: new Date(),
        status: 'approved',
        method: approval.payload?.method ?? 'cash',

        createdBy: {
          connect: {id: approval.createdById},
        },
      },
    });
  }

  private async createLedger(tx: Prisma.TransactionClient, approval: any, transactionId: bigint) {
    return tx.ledgerEntry.create({
      data: {
        somiteeId: approval.somiteeId,
        referenceType: 'transaction',
        referenceId: String(transactionId),
        description: 'Collection Approved',
        type: 'collection',
        debit: approval.amount,
        credit: 0,
        balance: 0,
        date: new Date(),
        createdById: approval.createdById,
      },
    });
  }
  private async createBankTransaction(
    tx: Prisma.TransactionClient,
    approval: any,
    transactionId: bigint,
  ) {
    if (!approval.payload?.bankAccountId) return;

    return tx.bankTransaction.create({
      data: {
        bankAccountId: approval.payload.bankAccountId,
        type: 'deposit',
        amount: approval.amount,
        date: new Date(),
        note: 'Approved collection',
        reference: String(transactionId),
        balanceAfter: 0,
        somiteeId: approval.somiteeId,
        createdById: approval.createdById,
      },
    });
  }

  async processExpenseApproval(approval: any, reviewerId: number) {
    return this.prisma.$transaction(async (tx) => {
      const {expenseId} = approval.payload;

      // 1. UPDATE EXPENSE
      const expense = await tx.expense.update({
        where: {id: BigInt(expenseId)},
        data: {
          status: 'approved',
        },
      });

      // 2. CREATE TRANSACTION
      await tx.transaction.create({
        data: {
          type: 'expense',
          amount: expense.amount,
          date: expense.date,
          status: 'approved',
          method: expense.method,
          category: expense.category,
          transactionId: `EXP-${expense.id}`,
          note: expense.note,
          somiteeId: expense.somiteeId,
          createdById: reviewerId,
        },
      });

      // 3. LEDGER POSTING
      await tx.ledgerEntry.create({
        data: {
          date: expense.date,
          description: `Expense: ${expense.category}`,
          type: 'expense',
          debit: expense.amount,
          credit: 0,
          balance: 0,
          referenceType: 'expense',
          referenceId: expense.id.toString(),
          somiteeId: expense.somiteeId,
          createdById: reviewerId,
        },
      });

      // 4. CASHBOOK POSTING
      await tx.cashBookEntry.create({
        data: {
          date: expense.date,
          description: `Expense: ${expense.category}`,
          cashIn: 0,
          cashOut: expense.amount,
          balance: 0,
          referenceType: 'expense',
          referenceId: expense.id.toString(),
          somiteeId: expense.somiteeId,
          createdById: reviewerId,
        },
      });

      // 5. UPDATE APPROVAL
      await tx.approval.update({
        where: {id: approval.id},
        data: {
          status: 'approved',
          reviewedById: BigInt(reviewerId),
          reviewedAt: new Date(),
        },
      });

      return {
        success: true,
        message: 'Expense approved & posted successfully',
      };
    });
  }

  async processIncomeApproval(
    approval: any,
    reviewerId: number,
    reviewerName: string,
    note?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const {incomeId} = approval.payload;

      // 1. UPDATE INCOME
      const income = await tx.income.update({
        where: {id: BigInt(incomeId)},
        data: {
          status: 'received',
        },
      });

      // 2. TRANSACTION ENTRY
      const transaction = await tx.transaction.create({
        data: {
          type: 'income',
          amount: income.amount,
          date: income.incomeDate,
          status: 'approved',
          method: 'cash',
          category: income.type,
          transactionId: `INC-${income.id}`,
          note: income.note,
          somiteeId: income.somiteeId,
          createdById: reviewerId,
        },
      });

      // 3. LEDGER (CREDIT ENTRY)
      await tx.ledgerEntry.create({
        data: {
          somiteeId: income.somiteeId,
          referenceType: 'transaction',
          referenceId: transaction.id.toString(),
          description: `Income: ${income.title}`,
          type: 'income',
          debit: 0,
          credit: income.amount,
          balance: 0,
          date: new Date(),
          createdById: reviewerId,
        },
      });

      // 4. CASHBOOK (CASH IN)
      await tx.cashBookEntry.create({
        data: {
          somiteeId: income.somiteeId,
          date: new Date(),
          description: `Income: ${income.title}`,
          cashIn: income.amount,
          cashOut: 0,
          balance: 0,
          referenceType: 'transaction',
          referenceId: transaction.id.toString(),
          createdById: reviewerId,
        },
      });

      // 5. BANK TRANSACTION (optional)
      if (income.bankAccountId) {
        await tx.bankTransaction.create({
          data: {
            bankAccountId: income.bankAccountId,
            type: 'deposit',
            amount: income.amount,
            date: new Date(),
            note: 'Approved income',
            reference: transaction.id.toString(),
            balanceAfter: 0,
            somiteeId: income.somiteeId,
            createdById: reviewerId,
          },
        });
      }

      // 6. APPROVAL UPDATE
      return tx.approval.update({
        where: {id: approval.id},
        data: {
          status: 'approved',
          rejectionNote: note,
          reviewedById: BigInt(reviewerId),
          reviewedByName: reviewerName,
          reviewedAt: new Date(),
        },
      });
    });
  }

  private async processReject(
    approval: any,
    reviewerId: number,
    reviewerName: string,
    note?: string,
  ) {
    return this.prisma.approval.update({
      where: {
        id: approval.id,
      },
      data: {
        status: 'rejected',
        rejectionNote: note,
        reviewedById: BigInt(reviewerId),
        reviewedByName: reviewerName,
        reviewedAt: new Date(),
      },
    });
  }
  async rejectApproval(
    id: number,
    dto: ApproveRejectDto,
    reviewerId: number,
    reviewerName: string,
    somiteeId: number,
  ) {
    try {
      if (!dto.note) {
        throw new BadRequestException('Rejection note is required');
      }

      const approval = await this.prisma.approval.findFirst({
        where: {id, somiteeId},
      });
      if (!approval) {
        throw new NotFoundException('Approval not found');
      }

      if (approval.status !== 'pending') {
        throw new BadRequestException('Approval is not in pending status');
      }

      // Check reviewer permissions
      const permissionMap = {
        collection: 'collection.approve',
        expense: 'expense.approve',
        bank: 'bank.approve',
        member: 'member.approve',
      };

      const requiredPermission = permissionMap[approval.type as keyof typeof permissionMap];
      const hasPermission = await this.checkUserPermission(reviewerId, requiredPermission);
      if (!hasPermission) {
        throw new ForbiddenException(`Missing permission: ${requiredPermission}`);
      }

      const updatedApproval = await this.prisma.approval.update({
        where: {id},
        data: {
          status: 'rejected',
          reviewedById: reviewerId,
          reviewedByName: reviewerName,
          reviewedAt: new Date(),
          rejectionNote: dto.note,
        },
      });

      return updatedApproval;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('approvals.service.service.rejectApproval error:', {
          message: error.message,
          stack: error.stack,
          id: id,
          dto: dto,
          reviewerId: reviewerId,
          reviewerName: reviewerName,
          somiteeId: somiteeId,
        });
      } else {
        console.error('approvals.service.service.rejectApproval unknown error:', error);
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to rejectApproval');
    }
  }

  async getApprovalStats(somiteeId: number) {
    try {
      const sid = BigInt(Number(somiteeId));

      if (Number.isNaN(Number(somiteeId))) {
        throw new BadRequestException('Invalid somiteeId');
      }

      const counts = await this.prisma.approval.groupBy({
        by: ['type'],
        where: {
          somiteeId: sid,
          status: 'pending',
        },
        _count: {
          _all: true,
        },
      });

      const stats = {
        totalPending: 0,
        byType: {
          collection: 0,
          expense: 0,
          bank: 0,
          member: 0,
        },
      };

      for (const item of counts) {
        const type = item.type as keyof typeof stats.byType;

        const count = item._count?._all ?? 0;

        if (type in stats.byType) {
          stats.byType[type] = count;
        }

        stats.totalPending += count;
      }

      return stats;
    } catch (error: unknown) {
      console.error('approvals.getApprovalStats error:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to getApprovalStats');
    }
  }

  private async checkUserPermission(userId: number, permission: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: {id: userId},
      include: {
        roleAssignments: {
          include: {role: true},
        },
      },
    });

    if (!user) return false;

    // Super admin and main user have all permissions
    if (user.role === 'super_admin' || user.role === 'main_user') {
      return true;
    }

    // Check assigned roles
    for (const assignment of user.roleAssignments) {
      const rolePermissions = assignment.role.permissions as string[];
      if (rolePermissions.includes(permission)) {
        return true;
      }
    }

    return false;
  }

  private async createRecordFromApproval(approval: any): Promise<any | null> {
    const payload = approval.payload;

    switch (approval.type) {
      case 'collection':
        const collection = await this.prisma.transaction.create({
          data: {
            memberId: payload.memberId,
            type: 'collection',
            amount: approval.amount,
            date: new Date(payload.date),
            status: 'approved',
            method: payload.method,
            category: payload.category,
            transactionId: payload.transactionId,
            note: payload.note,
            somiteeId: approval.somiteeId,
            createdById: approval.createdById,
          },
        });
        return collection.id;

      case 'expense':
        const expense = await this.prisma.expense.create({
          data: {
            amount: approval.amount,
            date: new Date(payload.date),
            category: payload.category,
            method: payload.method,
            note: payload.note,
            somiteeId: approval.somiteeId,
            createdById: approval.createdById,
          },
        });
        return expense.id;

      case 'bank':
        // Handle bank transactions (deposit/withdraw/transfer)
        const bankTx = await this.prisma.bankTransaction.create({
          data: {
            bankAccountId: payload.bankAccountId,
            type: payload.type, // deposit, withdraw, transfer
            amount: approval.amount,
            date: new Date(payload.date),
            note: payload.note,
            reference: payload.reference,
            balanceAfter: 0, // Will be updated after calculation
            somiteeId: approval.somiteeId,
            createdById: approval.createdById,
          },
        });

        // Update bank account balance
        const bankAccount = await this.prisma.bankAccount.findUnique({
          where: {id: payload.bankAccountId},
        });
        if (bankAccount) {
          let newBalance = bankAccount.balance;
          if (payload.type === 'deposit') {
            newBalance += approval.amount;
          } else if (payload.type === 'withdraw') {
            newBalance -= approval.amount;
          }
          await this.prisma.bankAccount.update({
            where: {id: payload.bankAccountId},
            data: {balance: newBalance},
          });
          await this.prisma.bankTransaction.update({
            where: {id: bankTx.id},
            data: {balanceAfter: newBalance},
          });
        }
        return bankTx.id;

      case 'member':
        const member = await this.prisma.member.create({
          data: {
            name: payload.name,
            shopName: payload.shopName,
            phone: payload.phone,
            address: payload.address,
            nid: payload.nid,
            monthlyFee: payload.monthlyFee,
            billingCycle: payload.billingCycle,
            somiteeId: approval.somiteeId,
            createdById: approval.createdById,
          },
        });
        return member.id;

      default:
        return null;
    }
  }
}
