import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from '@nestjs/class-validator';
import { Transform, Type } from 'class-transformer';
import { PetSex, PetSpecies } from '../entities/pet.entity';

export class FindPetsQueryDto {
  @ApiPropertyOptional({ example: 'Luna' })
  @IsOptional()
  @IsString({ message: 'El nombre de búsqueda debe ser texto.' })
  name?: string;

  @ApiPropertyOptional({ enum: PetSpecies })
  @IsOptional()
  @IsEnum(PetSpecies, { message: 'La especie no es válida.' })
  species?: PetSpecies;

  @ApiPropertyOptional({ enum: PetSex })
  @IsOptional()
  @IsEnum(PetSex, { message: 'El sexo no es válido.' })
  sex?: PetSex;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El ID del propietario debe ser un número entero.' })
  @Min(1, { message: 'El ID del propietario debe ser mayor que cero.' })
  ownerId?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'active debe ser true o false.' })
  active?: boolean;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser mayor que cero.' })
  page?: number;

  @ApiPropertyOptional({ example: 9, default: 9 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero.' })
  @Min(1, { message: 'El límite debe ser mayor que cero.' })
  limit?: number;
}
