import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {PrismaService} from '../../prisma/prisma.service';
import {ListIncomeQueryDto} from './dto/list-income-query.dto';
import {CreateIncomeDto} from './dto/create-income.dto';
import {UpdateIncomeDto} from './dto/update.income.dto';

@Injectable()
export class IncomeService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== LIST INCOME ======================
  async list(somiteeId: number, query: ListIncomeQueryDto) {
    try {
      const page = Number(query.page || 1);
      const limit = Number(query.limit || 10);

      const where: any = {
        somiteeId: BigInt(somiteeId),
      };

      // ======================
      // SMART SEARCH
      // ======================
      if (query.search) {
        const search = query.search.trim();

        where.OR = [
          {title: {contains: search}},
          {source: {contains: search}},
          {referenceNo: {contains: search}},
          {description: {contains: search}},
          {type: {contains: search}},
          {status: {contains: search}},
        ];
      }

      // ======================
      // FILTERS
      // ======================
      if (query.type) {
        where.type = query.type;
      }

      if (query.status) {
        where.status = query.status;
      }

      if (query.bankAccountId) {
        where.bankAccountId = BigInt(query.bankAccountId);
      }

      if (query.fromDate && query.toDate) {
        where.incomeDate = {
          gte: new Date(query.fromDate),
          lte: new Date(query.toDate),
        };
      }

      const [data, total] = await Promise.all([
        this.prisma.income.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: {incomeDate: 'desc'},
        }),
        this.prisma.income.count({where}),
      ]);

      return {
        data,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('income.list error:', error);
      throw new InternalServerErrorException('Failed to list income');
    }
  }

  async create(somiteeId: number, userId: number, body: CreateIncomeDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. CREATE INCOME (draft)
      const income = await tx.income.create({
        data: {
          title: body.title,
          type: body.type,
          amount: body.amount,
          incomeDate: new Date(body.incomeDate),
          source: body.source,
          referenceNo: body.referenceNo,
          description: body.description,
          note: body.note,
          status: 'pending', // 👈 IMPORTANT CHANGE

          bankAccountId: body.bankAccountId ? BigInt(body.bankAccountId) : null,

          somiteeId,
          createdById: userId,
        },
      });

      // 2. CREATE APPROVAL
      const approval = await tx.approval.create({
        data: {
          type: 'income',
          title: `Income - ${body.title}`,
          amount: body.amount,
          description: body.description,

          payload: {
            incomeId: income.id.toString(),
            ...body,
          },

          status: 'pending',
          somiteeId,
          createdById: userId,
          createdByName: 'System',
        },
      });

      return {
        success: true,
        message: 'Income sent for approval',
        data: {
          income,
          approval,
        },
      };
    });
  }

  // ==================== CREATE INCOME ======================
  async createOld(somiteeId: number, userId: number, body: CreateIncomeDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const income = await tx.income.create({
          data: {
            title: body.title,
            type: body.type,
            amount: body.amount,
            incomeDate: new Date(body.incomeDate),
            source: body.source,
            referenceNo: body.referenceNo,
            description: body.description,
            note: body.note,
            status: body.status || 'received',
            bankAccountId: body.bankAccountId ? BigInt(body.bankAccountId) : null,
            somiteeId,
            createdById: userId,
          },
        });

        // // ======================
        // // TRANSACTION LOG
        // // ======================
        // await tx.transaction.create({
        //   data: {
        //     memberId: null,
        //     memberName: null,
        //     type: 'income',
        //     amount: body.amount,
        //     date: new Date(body.incomeDate),
        //     status: 'approved',
        //     method: 'system',
        //     category: body.type,
        //     transactionId: `INC-${income.id}`,
        //     note: body.note,
        //     somiteeId,
        //     createdById: userId,
        //   },
        // });

        // // ======================
        // // LEDGER ENTRY
        // // ======================
        // await tx.ledgerEntry.create({
        //   data: {
        //     date: new Date(body.incomeDate),
        //     description: `Income: ${body.title}`,
        //     type: 'income',
        //     debit: 0,
        //     credit: body.amount,
        //     balance: 0,
        //     referenceType: 'income',
        //     referenceId: income.id.toString(),
        //     somiteeId,
        //     createdById: userId,
        //   },
        // });

        // // ======================
        // // CASHBOOK ENTRY
        // // ======================
        // await tx.cashBookEntry.create({
        //   data: {
        //     date: new Date(body.incomeDate),
        //     description: `Income: ${body.title}`,
        //     cashIn: body.amount,
        //     cashOut: 0,
        //     balance: 0,
        //     referenceType: 'income',
        //     referenceId: income.id.toString(),
        //     somiteeId,
        //     createdById: userId,
        //   },
        // });

        // // ======================
        // // BANK ACCOUNT UPDATE
        // // ======================
        // if (body.bankAccountId) {
        //   await tx.bankAccount.update({
        //     where: {id: BigInt(body.bankAccountId)},
        //     data: {
        //       balance: {
        //         increment: body.amount,
        //       },
        //     },
        //   });
        // }

        return {
          success: true,
          message: 'Income created successfully',
          data: income,
        };
      });
    } catch (error) {
      console.error('income.create error:', error);
      throw new InternalServerErrorException('Failed to create income');
    }
  }

  // ==================== UPDATE INCOME ======================
  async update(id: number, somiteeId: number, body: UpdateIncomeDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const income = await tx.income.findFirst({
          where: {id: BigInt(id), somiteeId},
        });

        if (!income) {
          throw new NotFoundException('Income not found');
        }

        const updated = await tx.income.update({
          where: {id: BigInt(id)},
          data: {
            title: body.title ?? income.title,
            type: body.type ?? income.type,
            amount: body.amount ?? income.amount,
            incomeDate: body.incomeDate ? new Date(body.incomeDate) : income.incomeDate,
            source: body.source ?? income.source,
            referenceNo: body.referenceNo ?? income.referenceNo,
            description: body.description ?? income.description,
            note: body.note ?? income.note,
            status: body.status ?? income.status,
            bankAccountId: body.bankAccountId ? BigInt(body.bankAccountId) : income.bankAccountId,
          },
        });

        await tx.transaction.updateMany({
          where: {
            transactionId: `INC-${id}`,
            somiteeId,
          },
          data: {
            amount: updated.amount,
            date: updated.incomeDate,
            category: updated.type,
            note: updated.note,
            status: updated.status,
          },
        });

        await tx.ledgerEntry.updateMany({
          where: {
            referenceType: 'income',
            referenceId: id.toString(),
            somiteeId,
          },
          data: {
            date: updated.incomeDate,
            description: `Income: ${updated.title}`,
            credit: updated.amount,
          },
        });

        await tx.cashBookEntry.updateMany({
          where: {
            referenceType: 'income',
            referenceId: id.toString(),
            somiteeId,
          },
          data: {
            date: updated.incomeDate,
            description: `Income: ${updated.title}`,
            cashIn: updated.amount,
          },
        });

        return {
          success: true,
          message: 'Income updated successfully',
          data: updated,
        };
      });
    } catch (error) {
      console.error('income.update error:', error);

      if (error instanceof NotFoundException) throw error;
      if (error instanceof BadRequestException) throw error;

      throw new InternalServerErrorException('Failed to update income');
    }
  }

  // ==================== DELETE INCOME ======================
  async remove(id: number, somiteeId: number) {
    try {
      await this.findOne(id, somiteeId);

      await this.prisma.income.delete({
        where: {id: BigInt(id)},
      });

      return null;
    } catch (error) {
      console.error('income.remove error:', error);

      if (error instanceof NotFoundException) throw error;

      throw new InternalServerErrorException('Failed to remove income');
    }
  }

  // ==================== TYPES ======================
  async types() {
    return [
      'Fixed Deposit Interest',
      'Bank Interest',
      'Donation',
      'Investment Profit',
      'Office Rent',
      'Service Charge',
      'Late Fee',
      'Registration Fee',
      'Other',
    ];
  }

  // ==================== FIND ONE ======================
  private async findOne(id: number, somiteeId: number) {
    const income = await this.prisma.income.findFirst({
      where: {id: BigInt(id), somiteeId},
    });

    if (!income) {
      throw new NotFoundException('Income not found');
    }

    return income;
  }
}
