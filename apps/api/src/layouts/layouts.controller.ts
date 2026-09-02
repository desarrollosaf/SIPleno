import { Controller, Get } from '@nestjs/common';
import { LayoutsService } from './layouts.service.js';

@Controller('layouts')
export class LayoutsController {
  constructor(private readonly layoutsService: LayoutsService) {}

  @Get()
  findAll() {
    return this.layoutsService.findAll();
  }
}
