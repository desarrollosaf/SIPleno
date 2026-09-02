import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let photoDirectory: string;

  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    photoDirectory = mkdtempSync(join(tmpdir(), 'asientos-fotos-'));
    process.env.PHOTO_DIR = photoDirectory;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('creates a person, assigns a seat and duplicates the version', async () => {
    const layouts = await request(app.getHttpServer()).get('/api/layouts').expect(200);
    expect(layouts.body).toHaveLength(6);

    const arrangements = await request(app.getHttpServer())
      .get('/api/arrangements')
      .expect(200);
    expect(arrangements.body).toHaveLength(6);
    const arrangementId = arrangements.body[0].id as string;

    const person = await request(app.getHttpServer())
      .post('/api/people')
      .send({ fullName: 'Persona de prueba', position: 'Invitado' })
      .expect(201);

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const photographed = await request(app.getHttpServer())
      .post(`/api/people/${person.body.id}/photo`)
      .attach('photo', png, { filename: 'persona.png', contentType: 'image/png' })
      .expect(201);
    expect(photographed.body.photoUrl).toContain(`/api/people/${person.body.id}/photo`);

    await request(app.getHttpServer())
      .get(`/api/people/${person.body.id}/photo`)
      .expect('Content-Type', /image\/png/)
      .expect(200);

    const assigned = await request(app.getHttpServer())
      .put(`/api/arrangements/${arrangementId}/assignments/A1`)
      .send({ personId: person.body.id })
      .expect(200);
    expect(assigned.body.assignments).toHaveLength(1);
    expect(assigned.body.assignments[0].seatId).toBe('A1');
    expect(assigned.body.assignments[0].person.photoUrl).toContain('/photo');

    const list = await request(app.getHttpServer())
      .get(`/api/arrangements/${arrangementId}/exports/word`)
      .buffer(true)
      .parse(binaryParser)
      .expect('Content-Type', /wordprocessingml/)
      .expect(200);
    expect(Buffer.byteLength(list.body)).toBeGreaterThan(4000);

    const labels = await request(app.getHttpServer())
      .get(`/api/arrangements/${arrangementId}/exports/labels`)
      .buffer(true)
      .parse(binaryParser)
      .expect('Content-Type', /wordprocessingml/)
      .expect(200);
    expect(Buffer.byteLength(labels.body)).toBeGreaterThan(4000);

    const copy = await request(app.getHttpServer())
      .post(`/api/arrangements/${arrangementId}/duplicate`)
      .send({ name: 'Versión de prueba' })
      .expect(201);
    expect(copy.body.assignments).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/api/arrangements/${copy.body.id}/assignments/A1`)
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
    rmSync(photoDirectory, { recursive: true, force: true });
    delete process.env.PHOTO_DIR;
  });
});

function binaryParser(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error) => callback(error as Error));
}
