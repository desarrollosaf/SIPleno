import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      application: 'Sistema local de asignación de asientos',
      timestamp: new Date().toISOString(),
    };
  }
}
