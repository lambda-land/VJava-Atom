// Nodes representing the data returned from the backend.
'use babel';

import { RangeLike } from 'atom';

type ChoiceKind = "positive" | "contrapositive";

export interface ContentNode {
    type: "text";
    content: string;
    span?: RangeLike;
}

export interface ChoiceNode {
    type: "choice";
    name: string;
    thenbranch: RegionNode;
    elsebranch: RegionNode;
    kind: ChoiceKind;
    span?: RangeLike;
}

export interface RegionNode {
    type: "region";
    segments: SegmentNode[];
    span?: RangeLike;
}

export type SegmentNode = ContentNode | ChoiceNode;
