import HTTP_STATUS from '../constants/http-status.js';
import ERROR_CODES from '../constants/error-codes.js';

class ApiError extends Error {
  constructor(
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    message = 'Internal server error',
    code = ERROR_CODES.INTERNAL_SERVER_ERROR,
    details = null,
    isOperational = true
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, ApiError);
  }
}

export default ApiError;