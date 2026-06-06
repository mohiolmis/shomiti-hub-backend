import {Injectable, OnModuleInit} from '@nestjs/common';
import {PrismaClient} from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.waitForDb();
  }

  async waitForDb(retries = 10, delay = 3000) {
    for (let i = 0; i < retries; i++) {
      try {
        console.log('Trying DB connection...');

        await this.$connect();

        console.log('✅ Database connected successfully');

        return;
      } catch (error) {
        console.error('❌ REAL DB ERROR =>');
        console.error(error);

        console.log(`⏳ DB retry ${i + 1}/${retries}`);

        await new Promise((res) => setTimeout(res, delay));
      }
    }

    throw new Error('❌ Database not reachable after retries');
  }
}
