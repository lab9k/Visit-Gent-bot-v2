import {
  AdaptiveCard,
  TextBlock,
  TextSize,
  TextColor,
  SubmitAction,
} from 'adaptivecards';
import { take } from 'lodash';
import lang from '../lang';
export default class DocumentCard {
  private readonly internalCard: AdaptiveCard;

  constructor() {
    this.internalCard = new AdaptiveCard();
  }

  public addTitle(title: string = 'Document'): DocumentCard {
    const titleText = new TextBlock();
    titleText.size = TextSize.Large;
    titleText.text = title;
    this.internalCard.addItem(titleText);
    return this;
  }
  public addSummary(document: QueryResponse.Document): DocumentCard {
    const summaryText = new TextBlock();
    summaryText.size = TextSize.Default;
    summaryText.text = `${take(document.summary.split(' '), 50).join(' ')}...`;
    this.internalCard.addItem(summaryText);
    return this;
  }
  public addConfidenceLevel(document: QueryResponse.Document): DocumentCard {
    const confidenceLevel = new TextBlock();
    confidenceLevel.text = `Confidence: ${document.scoreInPercent}`;
    confidenceLevel.size = TextSize.Small;
    confidenceLevel.color = this.getConfidenceColor(document.scoreInPercent);
    this.internalCard.addItem(confidenceLevel);
    return this;
  }
  public addAction(document: QueryResponse.Document): DocumentCard {
    const action = new SubmitAction();
    action.data = { content: document.resourceURI };
    action.title = lang.getStringFor(lang.READ_MORE);
    this.internalCard.addAction(action);
    return this;
  }
  public get card(): AdaptiveCard {
    return this.internalCard;
  }

  private getConfidenceColor(level: number): TextColor {
    return level < 30
      ? TextColor.Warning
      : level < 60
      ? TextColor.Attention
      : TextColor.Good;
  }
}
