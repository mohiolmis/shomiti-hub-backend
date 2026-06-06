import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {PrismaService} from '../../prisma/prisma.service';
import {ListExpenseQueryDto} from './dto/list-expense-query.dto';
import {CreateExpenseDto} from './dto/create-expense.dto';
import {UpdateExpenseDto} from './dto/update.expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== Get Collection List ======================
  async list(somiteeId: number, query: ListExpenseQueryDto) {
    try {
      const page = Number(query.page || 1);
      const limit = Number(query.limit || 10);

      const where: any = {
        somiteeId: BigInt(somiteeId),
      };

      // ======================
      // SMART SEARCH (ONE FIELD → MULTI MATCH)
      // ======================
      if (query.search) {
        const search = query.search.trim();
        const isNumber = !isNaN(Number(search));

        let memberIdFromReg: bigint | undefined;

        if (isNumber) {
          const memberReq = await this.prisma.memberRequest.findFirst({
            where: {
              memberRegNumber: BigInt(search),
              somiteeId: BigInt(somiteeId),
            },
          });

          if (memberReq?.memberId) {
            memberIdFromReg = memberReq.memberId;
          }
        }

        where.OR = [
          {category: {contains: search}},
          {note: {contains: search}},
          {status: {contains: search}},
          {method: {contains: search}},
          {
            member: {
              name: {contains: search},
            },
          },
          ...(memberIdFromReg ? [{memberId: memberIdFromReg}] : []),
        ];
      }

      // ======================
      // QUERY
      // ======================
      const [data, total] = await Promise.all([
        this.prisma.expense.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: {date: 'desc'},
        }),
        this.prisma.expense.count({where}),
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
      console.error('expense.list error:', error);
      throw new InternalServerErrorException('Failed to list expenses');
    }
  }

  async create(somiteeId: number, userId: number, body: CreateExpenseDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: {
            amount: body.amount,
            date: new Date(body.date),
            category: body.category,
            method: body.method,
            note: body.note,
            receiptUrl: body.receiptUrl,
            status: body.status || 'approved',
            somiteeId,
            createdById: userId,
          },
        });

        // 2. CREATE APPROVAL
        const approval = await tx.approval.create({
          data: {
            type: 'expense',
            title: `Expense - ${body.category}`,
            amount: body.amount,
            description: body.note,

            payload: {
              expenseId: expense.id.toString(),

              amount: body.amount,
              date: body.date,
              category: body.category,
              method: body.method,
              note: body.note,
              receiptUrl: body.receiptUrl,
            },

            status: 'pending',
            somiteeId,
            createdById: userId,
            createdByName: 'System',
          },
        });

        // await tx.transaction.create({
        //   data: {
        //     memberId: null,
        //     memberName: null,
        //     type: 'expense',
        //     amount: body.amount,
        //     date: new Date(body.date),
        //     status: 'approved',
        //     method: body.method,
        //     category: body.category,
        //     transactionId: `EXP-${expense.id}`,
        //     note: body.note,
        //     somiteeId,
        //     createdById: userId,
        //   },
        // });

        // await tx.ledgerEntry.create({
        //   data: {
        //     date: new Date(body.date),
        //     description: `Expense: ${body.category}`,
        //     type: 'expense',
        //     debit: body.amount,
        //     credit: 0,
        //     balance: 0,
        //     referenceType: 'expense',
        //     referenceId: expense.id.toString(),
        //     somiteeId,
        //     createdById: userId,
        //   },
        // });

        // await tx.cashBookEntry.create({
        //   data: {
        //     date: new Date(body.date),
        //     description: `Expense: ${body.category}`,
        //     cashIn: 0,
        //     cashOut: body.amount,
        //     balance: 0,
        //     referenceType: 'expense',
        //     referenceId: expense.id.toString(),
        //     somiteeId,
        //     createdById: userId,
        //   },
        // });

        return {
          success: true,
          message: 'Expense created successfully',
          data: expense,
        };
      });
    } catch (error: unknown) {
      console.error('expense.create error:', error);

      throw new InternalServerErrorException('Failed to create expense');
    }
  }

  async update(id: number, somiteeId: number, body: UpdateExpenseDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // ======================
        // 1. GET EXISTING EXPENSE
        // ======================
        const expense = await tx.expense.findFirst({
          where: {id: BigInt(id), somiteeId},
        });

        if (!expense) {
          throw new NotFoundException('Expense not found');
        }

        // ======================
        // 2. UPDATE EXPENSE
        // ======================
        const updatedExpense = await tx.expense.update({
          where: {id: BigInt(id)},
          data: {
            amount: body.amount ?? expense.amount,
            date: body.date ? new Date(body.date) : expense.date,
            category: body.category ?? expense.category,
            method: body.method ?? expense.method,
            note: body.note ?? expense.note,
            status: body.status ?? expense.status,
          },
        });

        // ======================
        // 3. UPDATE TRANSACTION
        // ======================
        await tx.transaction.updateMany({
          where: {
            transactionId: `EXP-${id}`,
            somiteeId,
          },
          data: {
            amount: updatedExpense.amount,
            date: updatedExpense.date,
            category: updatedExpense.category,
            method: updatedExpense.method,
            note: updatedExpense.note,
            status: updatedExpense.status,
          },
        });

        // ======================
        // 4. UPDATE LEDGER
        // ======================
        await tx.ledgerEntry.updateMany({
          where: {
            referenceType: 'expense',
            referenceId: id.toString(),
            somiteeId,
          },
          data: {
            date: updatedExpense.date,
            description: `Expense: ${updatedExpense.category}`,
            debit: updatedExpense.amount,
          },
        });

        // ======================
        // 5. UPDATE CASH BOOK
        // ======================
        await tx.cashBookEntry.updateMany({
          where: {
            referenceType: 'expense',
            referenceId: id.toString(),
            somiteeId,
          },
          data: {
            date: updatedExpense.date,
            description: `Expense: ${updatedExpense.category}`,
            cashOut: updatedExpense.amount,
          },
        });

        return {
          success: true,
          message: 'Expense updated successfully',
          data: updatedExpense,
        };
      });
    } catch (error: unknown) {
      console.error('expense.update error:', error);

      if (error instanceof NotFoundException) throw error;
      if (error instanceof BadRequestException) throw error;

      throw new InternalServerErrorException('Failed to update expense');
    }
  }

  async remove(id: number, somiteeId: number) {
    try {
      await this.findOne(id, somiteeId);
      await this.prisma.expense.delete({where: {id}});
      return null;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('expenses.service.service.remove error:', {
          message: error.message,
          stack: error.stack,
          id: id,
          somiteeId: somiteeId,
        });
      } else {
        console.error('expenses.service.service.remove unknown error:', error);
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to remove');
    }
  }

  async categories() {
    try {
      return [
        'Maintenance',
        'Electricity',
        'Water',
        'Security',
        'Cleaning',
        'Repair',
        'Office Supplies',
        'Transport',
        'Other',
      ];
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('expenses.service.service.categories error:', {
          message: error.message,
          stack: error.stack,
        });
      } else {
        console.error('expenses.service.service.categories unknown error:', error);
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to categories');
    }
  }

  private async findOne(id: number, somiteeId: number) {
    const expense = await this.prisma.expense.findFirst({where: {id, somiteeId}});
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    return expense;
  }
}
