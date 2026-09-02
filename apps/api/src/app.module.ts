import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { ArrangementsController } from './arrangements/arrangements.controller.js';
import { ArrangementsService } from './arrangements/arrangements.service.js';
import { DatabaseService } from './database/database.service.js';
import { WordExportService } from './exports/word-export.service.js';
import { PdfExportService } from './exports/pdf-export.service.js';
import { LayoutsController } from './layouts/layouts.controller.js';
import { LayoutsService } from './layouts/layouts.service.js';
import { PeopleController } from './people/people.controller.js';
import { PeopleService } from './people/people.service.js';

@Module({
  imports: [],
  controllers: [
    AppController,
    LayoutsController,
    PeopleController,
    ArrangementsController,
  ],
  providers: [
    DatabaseService,
    LayoutsService,
    PeopleService,
    ArrangementsService,
    WordExportService,
    PdfExportService,
  ],
})
export class AppModule {}
