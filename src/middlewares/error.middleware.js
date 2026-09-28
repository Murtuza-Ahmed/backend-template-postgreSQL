import { Prisma } from '../../generated/prisma/client.ts';
import { ZodError } from 'zod';
import ERROR_CODES from '../constants/error-codes.js';
import HTTP_STATUS from '../constants/http-status.js';
import env from '../config/env.js';
import { logger } from '../config/logger.js';
import ApiError from '../utils/api-error.js';
import { errorResponse } from '../utils/api-response.js';

const getValidationDetails = (error) =>
  error.issues.reduce((details, issue) => {
    const path = issue.path.join('.') || 'request';
    details[path] = issue.message;
    return details;
  }, {});

const redactSensitiveText = (value) =>
  value.replace(
    /(DATABASE_URL|PASSWORD|JWT_SECRET|SMTP_PASSWORD|OTP|AUTHORIZATION|TOKEN)\s*[:=]\s*[^\s,;]+/gi,
    '$1=[REDACTED]'
  );

const redactDetails = (value) => {
  if (typeof value === 'string') return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(redactDetails);
  if (!value || typeof value !== 'object') return value;

  return Object.entries(value).reduce((details, [key, detail]) => {
    details[key] = /(password|secret|token|authorization|databaseurl|otp)/i.test(
      key
    )
      ? '[REDACTED]'
      : redactDetails(detail);
    return details;
  }, {});
};

const toApiError = (error) => {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      'Validation failed',
      ERROR_CODES.VALIDATION_ERROR,
      getValidationDetails(error)
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new ApiError(
        HTTP_STATUS.CONFLICT,
        'Resource already exists',
        ERROR_CODES.DUPLICATE_RESOURCE
      );
    }

    if (error.code === 'P2025') {
      return new ApiError(
        HTTP_STATUS.NOT_FOUND,
        'Resource not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    if (error.code === 'P2003') {
      return new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        'Database validation failed',
        ERROR_CODES.DATABASE_VALIDATION_ERROR
      );
    }

    return new ApiError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Database request failed',
      ERROR_CODES.DATABASE_ERROR,
      null,
      false
    );
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      'Database validation failed',
      ERROR_CODES.DATABASE_VALIDATION_ERROR
    );
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new ApiError(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'Database service unavailable',
      ERROR_CODES.SERVICE_UNAVAILABLE,
      null,
      false
    );
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return new ApiError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Database request failed',
      ERROR_CODES.DATABASE_ERROR,
      null,
      false
    );
  }

  return new ApiError(
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    'Internal server error',
    ERROR_CODES.INTERNAL_SERVER_ERROR,
    null,
    false
  );
};

const notFoundHandler = (req, _res, next) => {
  next(
    new ApiError(
      HTTP_STATUS.NOT_FOUND,
      'Route not found',
      ERROR_CODES.ROUTE_NOT_FOUND,
      { path: req.originalUrl }
    )
  );
};

const errorMiddleware = (error, req, res, _next) => {
  void _next;
  const apiError = toApiError(error);
  const logContext = {
    method: req.method,
    path: redactSensitiveText(req.originalUrl),
    statusCode: apiError.statusCode,
    code: apiError.code,
  };

  if (!apiError.isOperational || apiError.statusCode >= 500) {
    const errorLog = {
      name: error.name,
      message: redactSensitiveText(error.message || 'Unknown error'),
      ...(env.NODE_ENV !== 'production' && error.stack
        ? { stack: redactSensitiveText(error.stack) }
        : {}),
    };
    logger.error('Request failed:', errorLog, logContext);
  } else {
    logger.warn('Operational request error:', logContext);
  }

  return errorResponse(res, {
    statusCode: apiError.statusCode,
    message: apiError.message,
    code: apiError.code,
    details: redactDetails(apiError.details),
  });
};

export { errorMiddleware, notFoundHandler, toApiError };