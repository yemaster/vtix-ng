import type { ProblemType } from './ProblemTypes'

export type AnswerValue = number | string

export default class PracticeProgress {
  testId: string
  timeSpentSeconds: number
  problemList: ProblemType[]
  correctAnswerList: (AnswerValue | AnswerValue[])[]
  answerList: AnswerValue[][]
  currentProblemId: number
  currentAnswer: AnswerValue[]
  submittedList: boolean[]

  constructor(options: {
    testId: string
    problemList: ProblemType[]
    timeSpentSeconds?: number
    currentProblemId?: number
    answerList?: AnswerValue[][]
    submittedList?: boolean[]
  }) {
    this.testId = options.testId
    this.problemList = options.problemList
    this.timeSpentSeconds = options.timeSpentSeconds ?? 0
    this.currentProblemId = Math.max(0, options.currentProblemId ?? 0)
    this.correctAnswerList = PracticeProgress.buildCorrectAnswerList(this.problemList)
    this.answerList =
      options.answerList ?? this.problemList.map(() => [])
    this.submittedList =
      options.submittedList ?? this.problemList.map(() => false)
    this.currentAnswer = this.answerList[this.currentProblemId] ?? []
  }

  static buildCorrectAnswerList(problemList: ProblemType[]) {
    return problemList.map((problem) => problem.answer)
  }

  setCurrentProblem(index: number) {
    if (index < 0 || index >= this.problemList.length) return
    this.currentProblemId = index
    this.currentAnswer = this.answerList[index] ?? []
  }

  updateCurrentAnswer(answer: AnswerValue[]) {
    this.currentAnswer = [...answer]
    if (this.answerList[this.currentProblemId]) {
      this.answerList[this.currentProblemId] = [...answer]
    }
  }

  markSubmitted(index = this.currentProblemId) {
    if (index < 0 || index >= this.submittedList.length) return
    this.submittedList[index] = true
  }

  setTimeSpent(seconds: number) {
    this.timeSpentSeconds = Math.max(0, Math.floor(seconds))
  }

  toJSON() {
    return {
      testId: this.testId,
      timeSpentSeconds: this.timeSpentSeconds,
      problemList: this.problemList,
      correctAnswerList: this.correctAnswerList,
      answerList: this.answerList,
      currentProblemId: this.currentProblemId,
      currentAnswer: this.currentAnswer,
      submittedList: this.submittedList
    }
  }
}
