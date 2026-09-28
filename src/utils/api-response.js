const successResponse = (
  res,
  { statusCode = 200, message = 'Request successful', data = {} } = {}
) => res.status(statusCode).json({ success: true, message, data });

const errorResponse = (res, { statusCode = 500, message, code, details = null } = {}
) => res.status(statusCode).json({ success: false, message, code, details });

export { errorResponse, successResponse };