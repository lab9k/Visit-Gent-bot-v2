import * as Airtable from 'airtable';
export default class AirtableApi {
  private readonly API_KEY: string;
  private readonly base: any;
  constructor() {
    this.API_KEY = process.env.AIRTABLE_API_KEY;
    if (!this.API_KEY) {
      throw 'No Airtable api key specified';
    }
    this.base = Airtable.base('app26Szli30UQb1Xh');
  }

  async addLine(options: {
    question: string;
    feedback: boolean;
    document: string;
    sessionid: string;
  }): Promise<any> {
    console.log(options);
    return this.base('Sessions').create(
      {
        sessionid: options.sessionid,
        question: options.question,
        Date: new Date(Date.now()).toISOString(),
        'document returned': options.document,
        Feedback: options.feedback ? 'Good' : 'Bad',
      },
      (err: any, record: any) => {
        if (err) {
          console.log('error creating airtable record');
          console.error(err);
          return;
        }
        console.log('airtable record successfully created');
        console.log(record.getId());
      },
    );
  }
}
