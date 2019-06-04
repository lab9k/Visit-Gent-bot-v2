import { Activity } from 'botbuilder';
import { ChannelId } from './models/ChannelIds';

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
