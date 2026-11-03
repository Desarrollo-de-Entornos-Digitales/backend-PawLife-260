import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PetsModule } from './pets/pets.module';
import { VeterinariansModule } from './veterinarians/veterinarians.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { VaccinesModule } from './vaccines/vaccines.module';
import { MedicationsModule } from './medication-catalog/medications.module';
import { PetMedicationsModule } from './pets-medication/medications.module';
import { WeightRecordsModule } from './weight-records/weight-records.module';
import { RemindersModule } from './reminders/reminders.module';
import { PhotosModule } from './photos/photos.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    PetsModule,
    VeterinariansModule,
    AppointmentsModule,
    VaccinesModule,
    MedicationsModule,
    PetMedicationsModule,
    WeightRecordsModule,
    RemindersModule,
    PhotosModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? ['.env.production', '.env']
          : ['.env.local', '.env'],
    
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('DB_HOST'),
        port: Number(configService.get<string>('DB_PORT', '5432')),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        autoLoadEntities: true,
        ssl: configService.get<string>('DB_SSL', 'false') === 'true',
        synchronize: true,
      }),
    }),
  ],
})
export class AppModule {}
