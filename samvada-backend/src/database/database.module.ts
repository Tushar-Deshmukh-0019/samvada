import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SessionEntity } from './entities/session.entity';
import { TranscriptEntity } from './entities/transcript.entity';
import { FeedbackEntity } from './entities/feedback.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        // Use individual params — avoids URL-parsing issues with special chars in password
        host:     config.get<string>('DB_HOST'),
        port:     parseInt(config.get<string>('DB_PORT') ?? '6543', 10),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASS'),
        database: config.get<string>('DB_NAME'),
        entities: [SessionEntity, TranscriptEntity, FeedbackEntity],
        /**
         * synchronize: true — auto-creates/updates tables on startup.
         * Safe for development; switch to migrations before going to production.
         */
        synchronize: true,
        ssl: {
          rejectUnauthorized: false,
        },
        logging: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
