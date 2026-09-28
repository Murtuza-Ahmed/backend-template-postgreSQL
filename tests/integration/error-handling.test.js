import express from 'express';
import { expect } from 'chai';
import { describe, it } from 'mocha';
import request from 'supertest';
import { Prisma } from '../../generated/prisma/client.ts';
import app from '../../src/app.js';
import ERROR_CODES from '../../src/constants/error-codes.js';
import HTTP_STATUS from '../../src/constants/http-status.js';
import { errorMiddleware } from '../../src/middlewares/error.middleware.js';
import ApiError from '../../src/utils/api-error.js';
import asyncHandler from '../../src/utils/async-handler.js';

describe('error handling', () => {
  it('returns the standard response for unknown routes', async () => {
    const response = await request(app).get('/missing-route');

    expect(response.status).to.equal(HTTP_STATUS.NOT_FOUND);
    expect(response.body).to.deep.equal({
      success: false,
      message: 'Route not found',
      code: ERROR_CODES.ROUTE_NOT_FOUND,
      details: { path: '/missing-route' },
    });
  });

  it('keeps health endpoints working', async () => {
    const response = await request(app).get('/health');

    expect(response.status).to.equal(HTTP_STATUS.OK);
    expect(response.body.success).to.equal(true);
  });

  it('forwards async controller errors to the global middleware', async () => {
    const testApp = express();
    testApp.get(
      '/async-error',
      asyncHandler(async () => {
        throw new ApiError(
          HTTP_STATUS.UNAUTHORIZED,
          'Authentication required',
          ERROR_CODES.UNAUTHORIZED
        );
      })
    );
    testApp.use(errorMiddleware);

    const response = await request(testApp).get('/async-error');

    expect(response.status).to.equal(HTTP_STATUS.UNAUTHORIZED);
    expect(response.body.code).to.equal(ERROR_CODES.UNAUTHORIZED);
  });

  it('hides unexpected error details from clients', async () => {
    const testApp = express();
    testApp.get('/unexpected-error', () => {
      throw new Error('DATABASE_URL=postgresql://secret/password');
    });
    testApp.use(errorMiddleware);

    const response = await request(testApp).get('/unexpected-error');

    expect(response.status).to.equal(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(response.body).to.deep.equal({
      success: false,
      message: 'Internal server error',
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      details: null,
    });
    expect(JSON.stringify(response.body)).not.to.include('DATABASE_URL');
  });

  it('maps Prisma unique constraint errors safely', async () => {
    const testApp = express();
    testApp.get('/duplicate', () => {
      throw new Prisma.PrismaClientKnownRequestError('secret database detail', {
        code: 'P2002',
        clientVersion: '7.10.0',
      });
    });
    testApp.use(errorMiddleware);

    const response = await request(testApp).get('/duplicate');

    expect(response.status).to.equal(HTTP_STATUS.CONFLICT);
    expect(response.body).to.deep.equal({
      success: false,
      message: 'Resource already exists',
      code: ERROR_CODES.DUPLICATE_RESOURCE,
      details: null,
    });
    expect(JSON.stringify(response.body)).not.to.include('secret database detail');
  });
});