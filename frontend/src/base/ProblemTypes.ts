export type SingleChooseProblemType = {
    id?: number;
    type: 1;
    content: string;
    choices: string[];
    answer: number;
    hint?: string;
};
export type MultiChooseProblemType = {
    id?: number;
    type: 2;
    content: string;
    choices: string[];
    answer: number[];
    hint?: string;
};
export type FillingProblemType = {
    id?: number;
    type: 3;
    content: string;
    answer: string;
    hint?: string;
};
export type JudgementProblemType = {
    id?: number;
    type: 4;
    content: string;
    choices: [string, string];
    answer: number;
    hint?: string;
};
export type ChooseProblemType = SingleChooseProblemType | MultiChooseProblemType | JudgementProblemType;
export type ProblemType = ChooseProblemType | FillingProblemType;
export type ProblemShowType = {
    title: string;
    time: number;
    categories: string[];
    id?: string;
};
