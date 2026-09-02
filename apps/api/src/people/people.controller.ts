import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CreatePersonDto, ImportPeopleDto, UpdatePersonDto } from './people.dto.js';
import { PeopleService } from './people.service.js';

@Controller('people')
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get()
  findAll(@Query('search') search?: string) {
    return this.peopleService.findAll(search || '');
  }

  @Post()
  create(@Body() dto: CreatePersonDto) {
    return this.peopleService.create(dto);
  }

  @Post('import')
  import(@Body() dto: ImportPeopleDto) {
    return this.peopleService.importCsv(dto.content);
  }

  @Delete()
  deleteAll() {
    return this.peopleService.deleteAll();
  }

  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Seleccione una fotografía JPG o PNG.');
    return this.peopleService.savePhoto(id, file);
  }

  @Get(':id/photo')
  photo(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const photo = this.peopleService.getPhoto(id);
    response.setHeader('Content-Type', photo.mime);
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return new StreamableFile(photo.data);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.peopleService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePersonDto) {
    return this.peopleService.update(id, dto);
  }

  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.peopleService.archive(id);
  }
}
