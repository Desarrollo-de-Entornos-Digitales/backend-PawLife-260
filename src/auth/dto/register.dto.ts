
import { ApiProperty } from '@nestjs/swagger';
import {
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class RegisterDto {
    @ApiProperty({ example: 'Ana Ruiz', maxLength: 100 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @ApiProperty({ example: 'ana@example.com', maxLength: 150 })
    @IsEmail()
    @MaxLength(150)
    email: string;

    @ApiProperty({ minLength: 6, maxLength: 255 })
    @IsString()
    @MinLength(6)
    @MaxLength(255)
    password: string;

    @ApiProperty({ required: false, maxLength: 20 })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;
}
