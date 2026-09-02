import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AssignPersonDto,
  CreateArrangementDto,
  DuplicateArrangementDto,
  UpdateArrangementDto,
} from './arrangements.dto.js';
import { ArrangementsService } from './arrangements.service.js';
import { WordExportService } from '../exports/word-export.service.js';
import { PdfExportService } from '../exports/pdf-export.service.js';

@Controller('arrangements')
export class ArrangementsController {
  constructor(
    private readonly arrangementsService: ArrangementsService,
    private readonly wordExportService: WordExportService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  @Get()
  findAll() {
    return this.arrangementsService.findAll();
  }

  @Get(':id/exports/word')
  async exportWord(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.wordExportService.createSeatList(id);
    setDownloadHeaders(response, result.filename);
    return new StreamableFile(result.buffer);
  }

  @Get(':id/exports/pdf')
  async exportPdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.pdfExportService.createMapAndList(id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return new StreamableFile(result.buffer);
  }

  @Get(':id/exports/labels')
  async exportLabels(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.wordExportService.createLabels(id);
    setDownloadHeaders(response, result.filename);
    return new StreamableFile(result.buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.arrangementsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateArrangementDto) {
    return this.arrangementsService.create(dto);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @Body() dto: DuplicateArrangementDto) {
    return this.arrangementsService.duplicate(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArrangementDto) {
    return this.arrangementsService.update(id, dto);
  }

  @Put(':id/assignments/:seatId')
  assign(
    @Param('id') id: string,
    @Param('seatId') seatId: string,
    @Body() dto: AssignPersonDto,
  ) {
    return this.arrangementsService.assign(id, seatId, dto);
  }

  @Delete(':id/assignments/:seatId')
  unassign(@Param('id') id: string, @Param('seatId') seatId: string) {
    return this.arrangementsService.unassign(id, seatId);
  }

  @Delete(':id/assignments')
  clear(@Param('id') id: string) {
    return this.arrangementsService.clear(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.arrangementsService.remove(id);
  }
}

function setDownloadHeaders(response: Response, filename: string): void {
  response.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}
