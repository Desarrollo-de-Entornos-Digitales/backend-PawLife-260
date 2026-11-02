
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { ILike, Repository } from 'typeorm';

import { User } from '../users/entities/user.entity';
import { Role } from './entities/role.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface LoginInput {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,

    private readonly jwtService: JwtService,
  ) {}

  // REGISTRAR USUARIO
  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();

    // Verificar si el correo ya existe
    const existingUser = await this.usersRepository.findOneBy({
      email,
    });

    if (existingUser) {
      throw new ConflictException(
        'Ya existe un usuario con ese correo',
      );
    }

    // Buscar automáticamente el rol OWNER
    const role = await this.rolesRepository.findOne({
      where: { name: ILike('OWNER') },
    });

    if (!role) {
      throw new NotFoundException(
        'No se encontró el rol OWNER',
      );
    }

    // Crear usuario y encriptar contraseña
    const user = this.usersRepository.create({
      name: input.name.trim(),
      email,
      password: await bcrypt.hash(input.password, 10),
      phone: input.phone?.trim() || null,
      role,
    });

    const savedUser = await this.usersRepository.save(user);

    // Recuperar usuario con sus relaciones
    const userWithRelations = await this.usersRepository.findOne({
      where: { id: savedUser.id },
      relations: {
        role: {
          rolePermissions: {
            permission: true,
          },
        },
      },
    });

    // Comprobar que el usuario exista
    if (!userWithRelations) {
      throw new NotFoundException(
        'No se pudo recuperar el usuario registrado',
      );
    }

    return this.createAuthResponse(userWithRelations);
  }

  // INICIAR SESIÓN
  async login(input: LoginInput) {
    const email = input.email.trim().toLowerCase();

    const user = await this.usersRepository.findOne({
      select: {
        id: true,
        email: true,
        password: true,
        name: true,
        role: true,
      },
      where: { email },
      relations: {
        role: {
          rolePermissions: {
            permission: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Credenciales inválidas',
      );
    }

    const isValidPassword = await bcrypt.compare(
      input.password,
      user.password,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException(
        'Credenciales inválidas',
      );
    }

    return this.createAuthResponse(user);
  }

  // GENERAR RESPUESTA DE AUTENTICACIÓN
  private createAuthResponse(user: User) {
    const {
      password: _password,
      role,
      ...safeUser
    } = user;

    const permissions =
      role?.rolePermissions?.map((rp) => rp.permission) ?? [];

    const userWithPermissions = {
      ...safeUser,
      role: {
        id: role.id,
        name: role.name,
        permissions,
      },
    };

    const payload = {
      sub: user.id,
      email: user.email,
      role: role?.name,
      permissions: permissions.map((p) => p.name),
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: userWithPermissions,
    };
  }
}
