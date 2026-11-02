import { Body,Controller,HttpCode,HttpStatus,Post,} from '@nestjs/common';

import {ApiBody,ApiOperation,ApiResponse,ApiTags,} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // INICIAR SESIÓN
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description:
      'Inicio de sesión exitoso. Retorna el token y el usuario con su rol y permisos.',
    schema: {
      example: {
        status: 'ok',
        data: {
          access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: {
            id: 123,
            name: 'Juan Perez',
            email: 'usuario@example.com',
            role: {
              id: 1,
              name: 'OWNER',
              permissions: [],
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos.',
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas.',
  })
  async login(@Body() input: LoginDto) {
    const { access_token, user } =
      await this.authService.login(input);

    return {
      status: 'ok',
      data: {
        access_token,
        user,
      },
    };
  }

  // REGISTRAR USUARIO
  @Post('register')
  @ApiOperation({
    summary: 'Registrar un nuevo usuario',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Usuario registrado exitosamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos.',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un usuario con ese correo.',
  })
  @ApiResponse({
    status: 404,
    description: 'No se encontró el rol OWNER.',
  })
  async register(@Body() input: RegisterDto) {
    const { access_token, user } =
      await this.authService.register(input);

    return {
      status: 'ok',
      data: {
        access_token,
        user,
      },
    };
  }
}
