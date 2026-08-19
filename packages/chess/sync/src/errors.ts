import { GraphQLError } from 'graphql';

export type ErrorBody = {
  status: number;
  code: string;
  type: string;
  name: string;
  message: string;
};

export function errorBody(
  status: number,
  name: string,
  message: string
): ErrorBody {
  return { status, code: name, type: name, name, message };
}

export class HttpError extends Error {
  readonly body: ErrorBody;
  constructor(status: number, name: string, message: string) {
    super(message);
    this.body = errorBody(status, name, message);
  }
}

export function gqlError(status: number, name: string, message: string) {
  return new GraphQLError(message, {
    extensions: errorBody(status, name, message),
  });
}
