
import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, ILike } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { getUploadDirectory } from '../common/upload-directory';
import { Photo } from './entities/photo.entity';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { Pet } from './entities/pet.entity';
import { FindPetsQueryDto } from './dto/find-pets-query.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class PetsService {
  private readonly logger = new Logger(PetsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // CREAR MASCOTA
  async create(
    input: CreatePetDto,
    photos: UploadedPhoto[] = [],
    authenticatedOwnerId?: number,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const {
          ownerId: requestedOwnerId,
          birthDate,
          ...petData
        } = input;

        // Si es propietario, siempre usamos el ID de su sesión.
        // Si es otro rol, usamos el ownerId enviado.
        const ownerId = authenticatedOwnerId ?? requestedOwnerId;

        if (ownerId === undefined) {
          throw new BadRequestException(
            'Debe indicarse el propietario de la mascota.',
          );
        }

        await this.validateOwner(manager, ownerId);
        this.validateBirthDate(birthDate);

        const petsRepository = manager.getRepository(Pet);

        const pet = petsRepository.create({
          ...petData,
          birthDate: birthDate ? new Date(birthDate) : null,
          active: input.active ?? true,
          owner: { id: ownerId },
        });

        const savedPet = await petsRepository.save(pet);

        await this.savePhotos(manager, savedPet, photos);

        return this.getPet(savedPet.id, manager, authenticatedOwnerId);
      });
    } catch (error) {
      await this.removeFiles(photos);
      throw error;
    }
  }

  // CONSULTAR MASCOTAS
  findAll(
    filters: FindPetsQueryDto = {},
    authenticatedOwnerId?: number,
  ) {
    const where: Record<string, unknown> = {
      active: filters.active ?? true,
    };

    if (filters.name) {
      where.name = ILike(`%${filters.name}%`);
    }

    if (filters.species) {
      where.species = filters.species;
    }

    if (filters.sex) {
      where.sex = filters.sex;
    }

    // El ID autenticado tiene prioridad sobre el filtro del frontend.
    if (authenticatedOwnerId !== undefined) {
      where.owner = { id: authenticatedOwnerId };
    } else if (filters.ownerId !== undefined) {
      where.owner = { id: filters.ownerId };
    }

    return this.dataSource.getRepository(Pet).find({
      where,
      relations: { owner: true, photos: true },
      order: { id: 'ASC' },
    });
  }

  // CONSULTAR UNA MASCOTA
  findOne(id: number, authenticatedOwnerId?: number) {
    return this.getPet(
      id,
      this.dataSource.manager,
      authenticatedOwnerId,
    );
  }

  // ACTUALIZAR MASCOTA
  async update(
    id: number,
    input: UpdatePetDto,
    photos: UploadedPhoto[] = [],
    authenticatedOwnerId?: number,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Comprueba que la mascota pertenezca al usuario autenticado.
        const pet = await this.getPet(
          id,
          manager,
          authenticatedOwnerId,
        );

        const {
          ownerId: requestedOwnerId,
          birthDate,
          ...petData
        } = input;

        // Un propietario no puede transferir su mascota a otra cuenta.
        if (
          authenticatedOwnerId !== undefined &&
          requestedOwnerId !== undefined &&
          requestedOwnerId !== authenticatedOwnerId
        ) {
          throw new ForbiddenException(
            'No puedes cambiar el propietario de tu mascota.',
          );
        }

        // Los otros roles pueden cambiar el propietario.
        if (
          authenticatedOwnerId === undefined &&
          requestedOwnerId !== undefined
        ) {
          await this.validateOwner(manager, requestedOwnerId);
        }

        if (birthDate !== undefined) {
          this.validateBirthDate(birthDate);
        }

        const petsRepository = manager.getRepository(Pet);

        petsRepository.merge(pet, petData);

        if (birthDate !== undefined) {
          pet.birthDate = birthDate ? new Date(birthDate) : null;
        }

        if (
          authenticatedOwnerId === undefined &&
          requestedOwnerId !== undefined
        ) {
          pet.owner = { id: requestedOwnerId } as Pet['owner'];
        }

        await petsRepository.save(pet);

        await this.savePhotos(manager, pet, photos);

        return this.getPet(id, manager, authenticatedOwnerId);
      });
    } catch (error) {
      await this.removeFiles(photos);
      throw error;
    }
  }

  // ELIMINAR MASCOTA (ARCHIVADO)
  async remove(
    id: number,
    authenticatedOwnerId?: number,
  ): Promise<void> {
    const petsRepository = this.dataSource.getRepository(Pet);

    const pet = await petsRepository.findOne({
      where:
        authenticatedOwnerId !== undefined
          ? {
              id,
              active: true,
              owner: { id: authenticatedOwnerId },
            }
          : {
              id,
              active: true,
            },
    });

    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }

    pet.active = false;

    await petsRepository.save(pet);
  }

  // BUSCAR MASCOTA COMPROBANDO SU PROPIETARIO
  private async getPet(
    id: number,
    manager: EntityManager,
    authenticatedOwnerId?: number,
  ): Promise<Pet> {
    const pet = await manager.getRepository(Pet).findOne({
      where:
        authenticatedOwnerId !== undefined
          ? {
              id,
              active: true,
              owner: { id: authenticatedOwnerId },
            }
          : {
              id,
              active: true,
            },
      relations: { owner: true, photos: true },
    });

    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }

    return pet;
  }

  // VALIDAR QUE EL PROPIETARIO EXISTA
  private async validateOwner(
    manager: EntityManager,
    ownerId: number,
  ) {
    const owner = await manager
      .getRepository(User)
      .findOneBy({ id: ownerId });

    if (!owner) {
      throw new NotFoundException('Propietario no encontrado');
    }
  }

  // VALIDAR FECHA DE NACIMIENTO
  private validateBirthDate(birthDate?: string | null) {
    if (
      birthDate &&
      birthDate > new Date().toISOString().slice(0, 10)
    ) {
      throw new BadRequestException(
        'La fecha de nacimiento no puede estar en el futuro.',
      );
    }
  }

  // GUARDAR FOTOGRAFÍAS
  private async savePhotos(
    manager: EntityManager,
    pet: Pet,
    photos: UploadedPhoto[],
  ) {
    if (!photos.length) {
      return;
    }

    await manager.getRepository(Photo).save(
      photos.map(({ filename, originalName }) =>
        manager.getRepository(Photo).create({
          filename,
          originalName,
          pet,
        }),
      ),
    );
  }

  // ELIMINAR ARCHIVOS SI FALLA LA OPERACIÓN
  private async removeFiles(
    photos: Pick<UploadedPhoto, 'filename'>[],
  ) {
    await Promise.all(
      photos.map(async ({ filename }) => {
        try {
          await unlink(
            join(getUploadDirectory(), basename(filename)),
          );
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code !== 'ENOENT'
          ) {
            this.logger.error(
              `No se pudo eliminar el archivo ${filename}`,
              error,
            );
          }
        }
      }),
    );
  }
}

export interface UploadedPhoto {
  filename: string;
  originalName: string;
}
