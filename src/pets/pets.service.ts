import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  BadRequestException,
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

  async create(input: CreatePetDto, photos: UploadedPhoto[] = []) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const { ownerId, birthDate, ...petData } = input;
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
        return this.getPet(savedPet.id, manager);
      });
    } catch (error) {
      await this.removeFiles(photos);
      throw error;
    }
  }

  async findAll(filters: FindPetsQueryDto = {}, currentUser?: { sub: number; role: string }) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 9;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { active: filters.active ?? true };
    if (filters.name) where.name = ILike(`%${filters.name}%`);
    if (filters.species) where.species = filters.species;
    if (filters.sex) where.sex = filters.sex;

    if (currentUser?.role === 'owner') {
      where.owner = { id: currentUser.sub };
    } else if (filters.ownerId) {
      where.owner = { id: filters.ownerId };
    }

    const [items, total] = await this.dataSource.getRepository(Pet).findAndCount({
      where,
      relations: { owner: true, photos: true },
      order: { id: 'ASC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  findOne(id: number) {
    return this.getPet(id, this.dataSource.manager);
  }

  async update(id: number, input: UpdatePetDto, photos: UploadedPhoto[] = []) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const pet = await this.getPet(id, manager);
        const { ownerId, birthDate, ...petData } = input;
        if (ownerId !== undefined) await this.validateOwner(manager, ownerId);
        if (birthDate !== undefined) this.validateBirthDate(birthDate);

        const petsRepository = manager.getRepository(Pet);
        petsRepository.merge(pet, petData);
        if (birthDate !== undefined) {
          pet.birthDate = birthDate ? new Date(birthDate) : null;
        }
        if (ownerId !== undefined) {
          pet.owner = { id: ownerId } as Pet['owner'];
        }

        await petsRepository.save(pet);
        await this.savePhotos(manager, pet, photos);
        return this.getPet(id, manager);
      });
    } catch (error) {
      await this.removeFiles(photos);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    const petsRepository = this.dataSource.getRepository(Pet);
    const pet = await petsRepository.findOneBy({ id, active: true });
    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }

    pet.active = false;
    await petsRepository.save(pet);
  }

  private async getPet(id: number, manager: EntityManager): Promise<Pet> {
    const pet = await manager.getRepository(Pet).findOne({
      where: { id, active: true },
      relations: { owner: true, photos: true },
    });
    if (!pet) {
      throw new NotFoundException('Mascota no encontrada');
    }
    return pet;
  }

  private async validateOwner(manager: EntityManager, ownerId: number) {
    const owner = await manager.getRepository(User).findOneBy({ id: ownerId });
    if (!owner) throw new NotFoundException('Propietario no encontrado');
  }

  private validateBirthDate(birthDate?: string | null) {
    if (birthDate && birthDate > new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException('La fecha de nacimiento no puede estar en el futuro.');
    }
  }

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
        manager.getRepository(Photo).create({ filename, originalName, pet }),
      ),
    );
  }

  private async removeFiles(photos: Pick<UploadedPhoto, 'filename'>[]) {
    await Promise.all(
      photos.map(async ({ filename }) => {
        try {
          await unlink(join(getUploadDirectory(), basename(filename)));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            this.logger.error(`No se pudo eliminar el archivo ${filename}`, error);
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
