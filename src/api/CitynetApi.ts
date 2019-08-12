import nodeFetch from 'node-fetch';
import { URLSearchParams } from 'url';
import * as download from 'download';
import IOptions from '../models/IOptions';

export default class CitynetApi {
  baseUrl: string;
  constructor() {
    this.baseUrl = 'https://api.cloud.nalantis.com/api';
  }

  public async query(
    question: string,
    options: IOptions,
  ): Promise<QueryResponse.QueryResponse> {
    const token = await this.login(options);
    let ret: QueryResponse.QueryResponse;
    try {
      const res = await nodeFetch(
        `${this.baseUrl}/v2/documents/query/semantic/generic`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            authorization: `Bearer ${token.value}`,
          },
          body: JSON.stringify({
            query: question,
            targetDocumentType: 'citynet',
            resultDetailLevel: 9,
            rows: 3,
          }),
          redirect: 'follow',
        },
      );
      const json = await res.json();
      ret = <QueryResponse.QueryResponse>json;
    } catch (error) {
      ret = { documents: [], conceptsOfQuery: [] };
    }

    return { ...ret, query: question };
  }

  public async login(
    options: IOptions,
  ): Promise<{ value: string; date: string }> {
    console.log(`Logging in for: ${options.city}`);
    const params = new URLSearchParams();
    const { login, password } = {
      login: options.citynet_login,
      password: options.citynet_password,
    };
    params.append('login', login);
    params.append('password', password);
    try {
      const { headers } = await nodeFetch(
        'https://api.cloud.nalantis.com/auth/v2/users/login',
        {
          method: 'POST',
          body: params,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          redirect: 'follow',
        },
      );
      const token = {
        value: headers.get('authorization').split('Bearer ')[1],
        date: headers.get('date'),
      };
      return token;
    } catch (error) {
      console.log(error.message);
      throw error;
    }
  }

  public async downloadFile(resourceUri: string, options: IOptions) {
    const token = await this.login(options);
    const headers = await nodeFetch(resourceUri, {
      headers: {
        authorization: `Bearer ${token.value}`,
        Accept: 'application/octet-stream',
      },
    }).then(res => res.headers);
    const contentDisposition = headers.get('content-disposition');
    const attachment = contentDisposition.split('; ');
    const filename = attachment[1].split(' = ')[1];
    const trimmedFileName = filename.substring(1, filename.length - 1);
    const contentType = headers.get('content-type');

    const dlOptions: download.DownloadOptions = {
      filename: trimmedFileName,
      headers: {
        authorization: `Bearer ${token.value}`,
        Accept: 'application/octet-stream',
      },
    };
    return {
      contentType: contentType.split(';')[0],
      buffer: await download(resourceUri, './downloads', dlOptions),
      filename: trimmedFileName,
    };
  }
}
