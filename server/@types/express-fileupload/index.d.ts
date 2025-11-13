declare module 'express-fileupload' {
  import { RequestHandler } from 'express';

  interface FileArray {
    [fieldname: string]: UploadedFile | UploadedFile[];
  }

  interface UploadedFile {
    name: string;
    data: Buffer;
    size: number;
    encoding: string;
    tempFilePath: string;
    truncated: boolean;
    mimetype: string;
    md5: string;
    mv: (path: string, callback: (err: any) => void) => void;
    mv: (path: string) => Promise<void>;
  }

  interface Options {
    debug?: boolean;
    useTempFiles?: boolean;
    tempFileDir?: string;
    safeFileNames?: boolean;
    preserveExtension?: boolean | string | number;
    abortOnLimit?: boolean;
    responseOnLimit?: string;
    limitHandler?: boolean;
    limit?: number | string;
    createParentPath?: boolean;
    uriDecodeFileNames?: boolean;
    uploadTimeout?: number;
    parseNested?: boolean;
    [key: string]: any;
  }

  function fileUpload(options?: Options): RequestHandler;

  export = fileUpload;
}
