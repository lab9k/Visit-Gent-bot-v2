import { Activity } from 'botbuilder';
import { ChannelId } from './models/ChannelIds';
import * as Turndown from 'turndown';

export function checkNested(obj: any, ...levels: string[]): boolean {
  for (let i = 0; i < levels.length; i += 1) {
    if (!obj || !obj.hasOwnProperty(levels[i])) {
      return false;
    }
    // tslint:disable-next-line:no-parameter-reassignment
    obj = obj[levels[i]];
  }
  return true;
}

export function isFacebook(activity: Activity): boolean {
  return activity.channelId === ChannelId.Facebook;
}
export function getBestParagraphForDoc(doc: QueryResponse.Document): string {
  const bestParagraph = doc.paragraphs.sort((a, b) => {
    return b.scoreInPercent - a.scoreInPercent;
  })[0];
  const td = new Turndown();
  const p = bestParagraph.highlighting
    ? bestParagraph.highlighting.join(' ')
    : bestParagraph.content;
  const reply = td.turndown(p);
  return reply;
}
