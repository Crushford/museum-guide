import type { RequestHandler } from 'express';
import createHttpError from 'http-errors';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(createHttpError(404, 'Not found'));
};
