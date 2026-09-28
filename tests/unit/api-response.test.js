import { expect } from 'chai';
import { describe, it } from 'mocha';
import { errorResponse, successResponse } from '../../src/utils/api-response.js';

const responseStub = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

describe('API responses', () => {
  it('formats successful responses consistently', () => {
    const response = responseStub();

    successResponse(response, {
      message: 'Created',
      data: { id: '1' },
      statusCode: 201,
    });

    expect(response.statusCode).to.equal(201);
    expect(response.body).to.deep.equal({
      success: true,
      message: 'Created',
      data: { id: '1' },
    });
  });

  it('formats error responses consistently', () => {
    const response = responseStub();

    errorResponse(response, {
      statusCode: 404,
      message: 'Resource not found',
      code: 'RESOURCE_NOT_FOUND',
    });

    expect(response.body).to.deep.equal({
      success: false,
      message: 'Resource not found',
      code: 'RESOURCE_NOT_FOUND',
      details: null,
    });
  });
});