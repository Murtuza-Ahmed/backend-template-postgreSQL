import { expect } from 'chai';
import { describe, it } from 'mocha';
import ERROR_CODES from '../../src/constants/error-codes.js';
import HTTP_STATUS from '../../src/constants/http-status.js';
import ApiError from '../../src/utils/api-error.js';

describe('ApiError', () => {
  it('preserves error behavior and exposes structured fields', () => {
    const error = new ApiError(
      HTTP_STATUS.NOT_FOUND,
      'Resource not found',
      ERROR_CODES.RESOURCE_NOT_FOUND
    );

    expect(error).to.be.instanceOf(Error);
    expect(error).to.be.instanceOf(ApiError);
    expect(error.message).to.equal('Resource not found');
    expect(error.statusCode).to.equal(HTTP_STATUS.NOT_FOUND);
    expect(error.code).to.equal(ERROR_CODES.RESOURCE_NOT_FOUND);
    expect(error.details).to.equal(null);
    expect(error.stack).to.be.a('string');
  });
});