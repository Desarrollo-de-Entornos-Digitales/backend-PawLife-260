import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AppPermission } from '../auth/enums/app-permission.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ensureUploadDirectory } from '../common/upload-directory';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { FindPetsQueryDto } from './dto/find-pets-query.dto';
import { Pet, PetSex, PetSpecies } from './entities/pet.entity';
import { PetsService, UploadedPhoto } from './pets.service';

interface UploadFile {
  mimetype: string;
  filename: string;
  originalname: string;
}

type UploadCallback = (error: Error | null, value: string) => void;

const { diskStorage } = require('multer');

const imageExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const UploadPhotos = FilesInterceptor('photos', 10, {
  storage: diskStorage({
    destination: (_request: unknown, _file: unknown, callback: UploadCallback) => {
      try {
        callback(null, ensureUploadDirectory());
      } catch (error) {
        callback(error as Error, '');
      }
    },
    filename: (_request: unknown, file: Pick<UploadFile, 'mimetype'>, callback: UploadCallback) => {
      callback(null, `${randomUUID()}${imageExtensions[file.mimetype]}`);
    },
  }),
  fileFilter: (
    _request: unknown,
    file: Pick<UploadFile, 'mimetype'>,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!imageExtensions[file.mimetype]) {
      return callback(new BadRequestException('Solo se permiten imágenes'), false);
    }
    callback(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

@ApiTags('Mascotas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Falta el permiso requerido.' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Post()
  @RequirePermissions(AppPermission.CREATE_PET)
  @ApiOperation({ summary: 'Crear una mascota' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: petFormSchema(true) })
  @ApiCreatedResponse({ description: 'Mascota creada.' })
  @ApiBadRequestResponse({ description: 'Los datos enviados no son válidos.' })
  @ApiNotFoundResponse({ description: 'Propietario no encontrado.' })
  @UseInterceptors(UploadPhotos)
  async create(
    @Body() input: CreatePetDto,
    @UploadedFiles() files: UploadFile[] = [],
  ) {
    return this.success(await this.petsService.create(input, this.photoData(files)));
  }

  @Get()
  @RequirePermissions(AppPermission.READ_PET)
  @ApiOperation({ summary: 'Obtener todas las mascotas con filtros y paginación' })
  @ApiOkResponse({ description: 'Lista paginada de mascotas.' })
  async findAll(
    @Query() filters: FindPetsQueryDto,
    @Req() req: { user?: { sub: number; email: string; role: string; permissions: string[] } },
  ) {
    const result = await this.petsService.findAll(filters, req?.user);
    return this.successPaginated(result);
  }

  @Get(':id')
  @RequirePermissions(AppPermission.READ_PET)
  @ApiOperation({ summary: 'Obtener una mascota por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Mascota encontrada.' })
  @ApiBadRequestResponse({ description: 'El ID debe ser un número entero.' })
  @ApiNotFoundResponse({ description: 'Mascota no encontrada.' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.success(await this.petsService.findOne(id));
  }

  @Patch(':id')
  @RequirePermissions(AppPermission.UPDATE_PET)
  @ApiOperation({ summary: 'Actualizar una mascota' })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: petFormSchema(false) })
  @ApiOkResponse({ description: 'Mascota actualizada.' })
  @ApiBadRequestResponse({ description: 'El ID o los datos no son válidos.' })
  @ApiNotFoundResponse({ description: 'Mascota o propietario no encontrado.' })
  @UseInterceptors(UploadPhotos)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() input: UpdatePetDto,
    @UploadedFiles() files: UploadFile[] = [],
  ) {
    return this.success(
      await this.petsService.update(id, input, this.photoData(files)),
    );
  }

  @Delete(':id')
  @RequirePermissions(AppPermission.DELETE_PET)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar una mascota' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ schema: { example: { status: 'ok', data: null } } })
  @ApiBadRequestResponse({ description: 'El ID debe ser un número entero.' })
  @ApiNotFoundResponse({ description: 'Mascota no encontrada.' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.petsService.remove(id);
    return this.success(null);
  }

  private success(data: Pet | Pet[] | null) {
    const safeData = Array.isArray(data)
      ? data.map((pet) => this.withoutOwnerPassword(pet))
      : data
        ? this.withoutOwnerPassword(data)
        : null;

    return { status: 'ok', data: safeData };
  }

  private successPaginated(data: {
    items: Pet[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }) {
    return {
      status: 'ok',
      data: {
        items: data.items.map((pet) => this.withoutOwnerPassword(pet)),
        meta: data.meta,
      },
    };
  }

  private withoutOwnerPassword(pet: Pet) {
    const owner = pet.owner ? this.withoutPassword(pet.owner) : pet.owner;
    const photos = pet.photos?.map(({ filename, ...photo }) => ({
      ...photo,
      url: `/uploads/${encodeURIComponent(basename(filename))}`,
    }));

    return { ...pet, owner, photos };
  }

  private withoutPassword({ password: _password, ...owner }: Pet['owner']) {
    return owner;
  }

  private photoData(files: UploadFile[]): UploadedPhoto[] {
    return files.map(({ filename, originalname }) => ({
      filename,
      originalName: originalname,
    }));
  }
}

function petFormSchema(requirePetFields: boolean) {
  return {
    type: 'object' as const,
    required: requirePetFields ? ['name', 'species', 'ownerId'] : undefined,
    properties: {
      name: { type: 'string', maxLength: 80 },
      species: { type: 'string', enum: Object.values(PetSpecies) },
      breed: { type: 'string', nullable: true },
      sex: { type: 'string', enum: Object.values(PetSex), nullable: true },
      birthDate: { type: 'string', format: 'date', nullable: true },
      active: { type: 'boolean' },
      ownerId: { type: 'integer' },
      photos: {
        type: 'array',
        items: { type: 'string', format: 'binary' },
      },
    },
  };
}
