import axios from 'axios';
import nodeFetch from 'node-fetch';
import { URLSearchParams } from 'url';
import * as moment from 'moment';
import * as download from 'download';
import IOptions from '../models/IOptions';

export default class CitynetApi {
  token: { value: string; date: any };
  baseUrl: string;
  constructor() {
    this.baseUrl = 'https://api.cloud.nalantis.com/api';
  }

  public async query(
    question: string,
    options: IOptions,
  ): Promise<QueryResponse.QueryResponse> {
    await this.login(options);
    let ret: QueryResponse.QueryResponse;
    try {
      const res = await nodeFetch(
        `${this.baseUrl}/v2/documents/query/semantic/generic`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${this.token.value}`,
          },
          body: JSON.stringify({
            query: question,
            targetDocumentType: 'citynet',
            resultDetailLevel: 9,
            rows: 3,
          }),
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
    if (!this.isTokenValid()) {
      const params = new URLSearchParams();
      const { login, password } = {
        login: options.citynet_login,
        password: options.citynet_password,
      };
      params.append('login', login);
      params.append('password', password);
      try {
        const { headers, body } = await nodeFetch(
          'https://api.cloud.nalantis.com/auth/v2/users/login',
          {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        );
        const token = {
          value: headers.get('Authorization').split('Bearer ')[1],
          date: headers.get('date'),
        };
        this.token = token;
        return token;
      } catch (error) {
        console.log(error.message);
        throw error;
      }
    }
    return this.token;
  }

  private getCredentials(): { login: string; password: string } {
    const login = process.env.CITYNET_LOGIN;
    const password = process.env.CITYNET_PASSWORD;
    if (!login || !password) {
      throw 'No Citynet credentials provided in env';
    }
    return { login, password };
  }

  private isTokenValid(): boolean {
    if (!this.token) return false;
    return moment(this.token.date).isAfter(moment().subtract(24, 'hours'));
  }

  public async downloadFile(resourceUri: string) {
    const headers = await nodeFetch(resourceUri, {
      headers: {
        Authorization: `Bearer ${this.token.value}`,
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
        Authorization: `Bearer ${this.token.value}`,
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
