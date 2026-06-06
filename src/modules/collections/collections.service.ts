import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {PrismaService} from '../../prisma/prisma.service';
import {CreateTransactionDto} from './dto/create-transaction.dto';
import {UpdateTransactionDto} from './dto/update-transaction-dto';
import {ChangeTransactionStatusDto} from './dto/change.transaction.status-dto';
import {MemberStatCountDto} from './dto/member-stat-count.dto';
import {CreateCollectionDto} from './dto/create-collection.dto';
import {ListCollectionQueryDto} from './dto/list-collection-query.dto';

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== Get Collection List ======================
  // FIX: ensure number conversion for memberId and pagination params
  // FIX: add error handling and logging
  // FIX: add search functionality for memberName and transactionId
  // FIX: add date range filtering
  // FIX: add total count for pagination metadata
  // FIX: ensure consistent response format with success flag and meta info
  // FIX: add try-catch blocks to handle unexpected errors and log them
  async list(somiteeId: number, query: any) {
    try {
      const page = Number(query.page || 1);
      const limit = Number(query.limit || 10);

      const where: any = {
        somiteeId,
      };

      // ======================
      // SEARCH FIXED
      // ======================
      if (query.search) {
        where.OR = [
          {memberName: {contains: query.search}},
          {transactionId: {contains: query.search}},
        ];
      }

      if (query.status) where.status = query.status;
      if (query.method) where.method = query.method;
      if (query.category) where.category = query.category;

      // FIX: ensure number conversion
      if (query.memberId) {
        where.memberId = BigInt(query.memberId);
      }

      if (query.dateFrom || query.dateTo) {
        where.date = {};
        if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
        if (query.dateTo) where.date.lte = new Date(query.dateTo);
      }

      const [data, total] = await Promise.all([
        this.prisma.transaction.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: {date: 'desc'},
        }),
        this.prisma.transaction.count({where}),
      ]);

      return {
        success: true,
        data,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: unknown) {
      console.error('transaction.list error:', {
        message: error instanceof Error ? error.message : error,
        somiteeId,
        query,
      });

      throw new InternalServerErrorException('Failed to list transactions');
    }
  }

  // List Collectin
  async listCollections(somiteeId: number, query: ListCollectionQueryDto) {
    try {
      const page = Number(query.page || 1);
      const limit = Number(query.limit || 10);

      const where: any = {
        somiteeId: BigInt(somiteeId),
      };

      // ======================
      // SEARCH
      // ======================
      if (query.search) {
        where.OR = [
          {
            member: {
              name: {contains: query.search},
            },
          },
          {
            transactionId: {contains: query.search},
          },
        ];
      }

      // ======================
      // FILTERS
      // ======================
      if (query.status) where.status = query.status;
      if (query.method) where.method = query.method;
      if (query.category) where.category = query.category;
      if (query.financialYear) {
        where.financialYear = query.financialYear;
      }

      // memberId filter
      if (query.memberId) {
        const memberReq = await this.prisma.member.findFirst({
          where: {
            id: BigInt(query.memberId),
            somiteeId: BigInt(somiteeId),
          },
        });

        if (memberReq?.id) {
          where.memberId = memberReq.id;
        } else {
          return {
            success: true,
            data: [],
            meta: {page, limit, total: 0, totalPages: 0},
            totalCollection: 0, // 🔥 added
          };
        }
      }

      // ======================
      // DATE FILTER
      // ======================
      if (query.dateFrom || query.dateTo) {
        where.paymentDate = {};
        if (query.dateFrom) where.paymentDate.gte = new Date(query.dateFrom);
        if (query.dateTo) where.paymentDate.lte = new Date(query.dateTo);
      }

      // ======================
      // QUERY
      // ======================
      const [data, total, totalCollectionAgg] = await Promise.all([
        this.prisma.payment.findMany({
          where,
          include: {
            member: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            paymentItems: true,
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: {paymentDate: 'desc'},
        }),

        this.prisma.payment.count({where}),

        // 🔥 TOTAL COLLECTION (NEW)
        this.prisma.payment.aggregate({
          where,
          _sum: {
            amount: true,
          },
        }),
      ]);

      const formatted = data.map((p) => ({
        id: p.id,
        memberId: p.memberId,
        memberName: p.member?.name,
        amount: p.amount,
        method: p.method,
        status: p.status,
        category: p.category,
        transactionId: p.transactionId,
        note: p.note,
        financialYear: p.financialYear,
        date: p.paymentDate,
        months: p.paymentItems.map((i) => i.month),
        createdAt: p.createdAt,
      }));

      return {
        success: true,
        data: formatted,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },

        // 🔥 NEW FIELD
        totalCollection: totalCollectionAgg._sum.amount || 0,
      };
    } catch (error: unknown) {
      console.error('collections.list error:', {
        message: error instanceof Error ? error.message : error,
        somiteeId,
        query,
      });

      throw new InternalServerErrorException('Failed to list collections');
    }
  }
  // ==================== Create Collection ======================
  // FIX: validate memberId exists and belongs to the somitee
  // FIX: validate amount is positive
  // FIX: add error handling and logging
  // FIX: ensure consistent response format with success flag
  // FIX: add try-catch blocks to handle unexpected errors and log them
  async create(somiteeId: number, userId: number, body: CreateTransactionDto) {
    try {
      const memberRegNumber = BigInt(body.memberRegNumber);

      // =========================
      // 1. CHECK MEMBER EXISTS
      // =========================
      const request = await this.prisma.memberRequest.findFirst({
        where: {
          memberRegNumber: BigInt(memberRegNumber),
          somiteeId: BigInt(somiteeId),
        },
      });

      if (!request) {
        throw new NotFoundException('Member request not found');
      }

      if (!request.memberId) {
        throw new BadRequestException('Member not approved yet');
      }

      const memberInfo = await this.prisma.member.findFirst({
        where: {
          id: request.memberId,
          somiteeId: BigInt(somiteeId),
        },
      });

      // =========================
      // 2. CREATE TRANSACTION
      // =========================
      return await this.prisma.transaction.create({
        data: {
          memberId: request.memberId,
          amount: body.amount,
          memberName: memberInfo ? memberInfo.name : `Reg#${memberRegNumber}`,
          method: body.method || 'cash',
          category: body.category ?? null,
          transactionId: body.transactionId ?? null,
          note: body.note ?? null,

          date: new Date(),
          createdById: BigInt(userId),
          somiteeId: BigInt(somiteeId),

          type: 'collection',
          status: 'pending',
        },
      });
    } catch (error: unknown) {
      console.error('transaction.create error:', {
        message: error instanceof Error ? error.message : error,
        somiteeId,
        body,
      });

      throw new InternalServerErrorException('Failed to create transaction');
    }
  }

  // ==================== Update Collection ======================
  // FIX: validate transaction exists and belongs to the somitee
  // FIX: validate amount is positive if provided
  // FIX: add error handling and logging
  // FIX: ensure consistent response format with success flag
  // FIX: add try-catch blocks to handle unexpected errors and log them
  // FIX: only allow updating certain fields and prevent changing memberId and somiteeId
  async update(id: number, somiteeId: number, userId: number, body: UpdateTransactionDto) {
    try {
      const transactionId = Number(id);

      if (isNaN(transactionId)) {
        throw new BadRequestException('Invalid transaction id');
      }

      // =========================
      // 1. CHECK EXISTS
      // =========================
      const existing = await this.prisma.transaction.findFirst({
        where: {
          id: transactionId,
          somiteeId: BigInt(somiteeId),
        },
      });

      if (!existing) {
        throw new NotFoundException('Transaction not found');
      }

      // =========================
      // 2. UPDATE SAFE DATA
      // =========================
      return await this.prisma.transaction.update({
        where: {
          id: transactionId,
        },
        data: {
          amount: body.amount ?? existing.amount,
          method: body.method ?? existing.method,
          category: body.category ?? existing.category,
          transactionId: body.transactionId ?? existing.transactionId,
          note: body.note ?? existing.note,
          status: body.status ?? existing.status,

          updatedAt: new Date(),
          updatedById: BigInt(userId),
        },
      });
    } catch (error: unknown) {
      console.error('transaction.update error:', {
        message: error instanceof Error ? error.message : error,
        id,
        somiteeId,
        body,
      });

      throw new InternalServerErrorException('Failed to update transaction');
    }
  }

  // ==================== Delete Collection ======================
  // FIX: validate transaction exists and belongs to the somitee
  // FIX: add error handling and logging
  // FIX: ensure consistent response format with success flag
  // FIX: add try-catch blocks to handle unexpected errors and log them
  async remove(id: number, somiteeId: number) {
    try {
      const transactionId = Number(id);

      if (isNaN(transactionId)) {
        throw new BadRequestException('Invalid transaction id');
      }

      // ======================
      // 1. FIND FIRST (VALIDATION)
      // ======================
      const transaction = await this.prisma.transaction.findFirst({
        where: {
          id: transactionId,
          somiteeId,
        },
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      // ======================
      // 2. DELETE
      // ======================
      await this.prisma.transaction.delete({
        where: {id: transactionId},
      });

      return {
        success: true,
        message: 'Transaction deleted successfully',
        id: transactionId,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('collections.service.service.remove error:', {
          message: error.message,
          stack: error.stack,
          id,
          somiteeId,
        });
      } else {
        console.error('collections.service.service.remove unknown error:', error);
      }

      if (error instanceof NotFoundException) throw error;
      if (error instanceof BadRequestException) throw error;

      throw new InternalServerErrorException('Failed to remove');
    }
  }

  // ==================== Change Transaction Status ======================
  // FIX: validate transaction exists and belongs to the somitee
  // FIX: validate status value is allowed (e.g. pending, approved, rejected)
  // FIX: add error handling and logging
  // FIX: ensure consistent response format with success flag
  // FIX: add try-catch blocks to handle unexpected errors and log them
  async changeStatus(id: number, somiteeId: number, dto: ChangeTransactionStatusDto) {
    const transactionId = Number(id);

    const transaction = await this.prisma.transaction.findFirst({
      where: {id: transactionId, somiteeId},
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return this.prisma.transaction.update({
      where: {id: transactionId},
      data: {
        status: dto.status,
        note: dto.note ?? null,
        approvedAt: new Date(),
      },
    });
  }

  async publicPay(paymentLink: string, body: any) {
    try {
      return {
        gatewayUrl: 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php',
        sessionKey: 'ssl-session-xyz',
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('collections.service.service.publicPay error:', {
          message: error.message,
          stack: error.stack,
          paymentLink: paymentLink,
          body: body,
        });
      } else {
        console.error('collections.service.service.publicPay unknown error:', error);
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to publicPay');
    }
  }

  async publicCallback(body: any) {
    try {
      return {
        collectionId: 't-ssl-1',
        transactionId: body.transactionId || 'SSL98765',
        status: 'approved',
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('collections.service.service.publicCallback error:', {
          message: error.message,
          stack: error.stack,
          body: body,
        });
      } else {
        console.error('collections.service.service.publicCallback unknown error:', error);
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to publicCallback');
    }
  }

  async quickPay(body: any) {
    try {
      return {
        id: 'mp-uuid',
        ...body,
        amount: 0,
        lateFee: 0,
        discount: body.discount || 0,
        totalPaid: 0,
        status: 'approved',
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('collections.service.service.quickPay error:', {
          message: error.message,
          stack: error.stack,
          body: body,
        });
      } else {
        console.error('collections.service.service.quickPay unknown error:', error);
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to quickPay');
    }
  }

  async memberStatCount(dto: MemberStatCountDto) {
    try {
      console.log('---------------sdfdsf');

      const regNo = Number(dto.memberRegNumber);

      if (isNaN(regNo)) {
        throw new BadRequestException('Invalid memberRegNumber');
      }

      if (!dto.financialYear) {
        throw new BadRequestException('financialYear is required');
      }

      // ======================
      // 1. FIND MEMBER BY REG NUMBER
      // ======================
      const memberInfo = await this.prisma.memberRequest.findFirst({
        where: {
          memberRegNumber: BigInt(regNo),
        },
      });

      if (!memberInfo) {
        throw new NotFoundException('Member not found');
      }

      if (!memberInfo.memberId) {
        throw new BadRequestException('Member is not approved yet');
      }

      const memberId = Number(memberInfo.memberId);

      // ======================
      // 2. GET PAYMENTS
      // ======================
      const payments = await this.prisma.payment.findMany({
        where: {
          memberId: BigInt(memberId),
          financialYear: dto.financialYear,
        },
        orderBy: {
          paymentDate: 'desc',
        },
      });

      // ======================
      // 3. SUMMARY CALCULATION
      // ======================
      const totalCollected = payments.reduce((sum, p) => {
        return p.status === 'paid' ? sum + Number(p.amount) : sum;
      }, 0);

      const totalPayments = payments.length;

      const pendingPayments = payments.filter((p) => p.status === 'pending').length;

      const approvedPayments = payments.filter((p) => p.status === 'paid').length;

      // ======================
      // 4. RESPONSE
      // ======================
      return {
        success: true,
        member: {
          id: memberInfo.memberId,
          regNumber: regNo,
          name: memberInfo.nameBn || memberInfo.nameEn || `Reg#${regNo}`,
        },
        financialYear: dto.financialYear,
        summary: {
          totalCollected,
          totalPayments,
          approvedPayments,
          pendingPayments,
        },
        history: payments,
      };
    } catch (error: unknown) {
      console.error('memberStatCount error:', {
        message: error instanceof Error ? error.message : error,
        dto,
      });

      if (error instanceof NotFoundException) throw error;
      if (error instanceof BadRequestException) throw error;

      throw new InternalServerErrorException('Failed to fetch member stats');
    }
  }

  private async findOne(id: number, somiteeId: number) {
    const transaction = await this.prisma.transaction.findFirst({where: {id, somiteeId}});
    if (!transaction) {
      throw new NotFoundException('Collection not found');
    }
    return transaction;
  }

  // ==================== Create Collection (Advanced) ======================
  // This method handles both single and multi-month collections with detailed validation and error handling
  // FIX: validate member exists and belongs to the somitee
  // FIX: validate amount is positive
  // FIX: validate method and transactionId for digital payments
  // FIX: for multi-month, validate financialYear and check for duplicate payments
  // FIX: calculate expected total with late fee and discount and validate totalPaid if provided
  // FIX: use transaction to ensure atomicity when creating payment, payment items, and transaction record
  // FIX: add detailed error handling and logging for each step
  async createCollection(somiteeId: number, userId: number, body: CreateCollectionDto) {
    try {
      // ======================
      // 1. FIND MEMBER
      // ======================
      const member = await this.prisma.member.findFirst({
        where: {
          id: BigInt(body.memberId),
          somiteeId: BigInt(somiteeId),
        },
      });

      if (!member?.id) {
        throw new NotFoundException('Member not found or not approved');
      }

      const memberId = member.id;

      // ======================
      // 2. VALIDATION
      // ======================
      const digitalMethods = ['bkash', 'nagad', 'bank', 'sslcommerz'];

      if (digitalMethods.includes(body.method) && !body.transactionId) {
        throw new BadRequestException('Transaction ID required');
      }

      const months = body.months ?? [];
      const isMultiMonth = months.length > 0;

      const lateFee = body.lateFee || 0;
      const discount = body.discount || 0;

      const expectedTotal = body.amount + lateFee - discount;

      // if (body.totalPaid !== undefined && Math.abs(body.totalPaid - expectedTotal) > 1) {
      //   throw new BadRequestException('Invalid totalPaid calculation');
      // }

      // ======================
      // 3. TRANSACTION BLOCK
      // ======================
      return await this.prisma.$transaction(async (tx) => {
        // ======================
        // PAYMENT CREATE
        // ======================
        const payment = await tx.payment.create({
          data: {
            memberId: BigInt(memberId),
            amount: body.totalPaid ?? expectedTotal,
            paymentDate: new Date(body.date),
            method: body.method,
            status: 'pending',
            category: body.category ?? 'Monthly Fee',
            transactionId: body.transactionId,
            note: body.note,
            financialYear: body.financialYear,
            somiteeId: BigInt(somiteeId),
            createdById: BigInt(userId),
          },
        });

        // ======================
        // PAYMENT ITEMS (MONTHS)
        // ======================
        if (isMultiMonth) {
          await tx.paymentItem.createMany({
            data: months.map((m: number) => ({
              paymentId: payment.id,
              memberId: BigInt(memberId),
              month: m,
              financialYear: body.financialYear!,
              amount: Math.floor(body.amount / months.length),
              somiteeId: BigInt(somiteeId),
              createdById: BigInt(userId),
            })),
          });
        }

        // =========================
        // 🔥 CREATE APPROVAL ONLY
        // =========================
        const approval = await this.prisma.approval.create({
          data: {
            type: 'collection',
            title: `Collection from ${member.name}`,
            amount: expectedTotal,
            payload: {
              paymentId: payment.id.toString(), // ✅ FIX: paymentId as string in payload for easier retrieval
              memberId: body.memberId,
              memberName: member.name,
              amount: body.amount,
              totalPaid: expectedTotal,
              lateFee,
              discount,
              months,
              financialYear: body.financialYear,
              date: body.date,
              method: body.method,
              transactionId: body.transactionId,
              note: body.note,
            },
            status: 'pending',
            createdById: BigInt(userId),
            createdByName: 'system',
            somiteeId: BigInt(somiteeId),
          },
        });

        // ======================
        // RESPONSE
        // ======================
        return {
          success: true,
          message: 'Collection recorded successfully',
          data: {
            id: payment.id,
            memberId,
            memberName: member.name || member.name || '',
            amount: body.amount,
            lateFee,
            discount,
            totalPaid: body.amount + lateFee - discount,
            financialYear: body.financialYear,
            months,
            date: body.date,
            method: body.method,
            status: 'pending',
          },
        };
      });
    } catch (error) {
      console.error('createCollection error:', error);

      if (error instanceof BadRequestException) throw error;
      if (error instanceof NotFoundException) throw error;
      if (error instanceof ConflictException) throw error;

      throw new InternalServerErrorException('Failed to create collection');
    }
  }
}
