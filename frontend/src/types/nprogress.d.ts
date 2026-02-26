declare module 'nprogress' {
  type NProgressOptions = {
    minimum?: number
    easing?: string
    positionUsing?: string
    speed?: number
    trickle?: boolean
    trickleSpeed?: number
    showSpinner?: boolean
    barSelector?: string
    spinnerSelector?: string
    parent?: string
    template?: string
  }

  interface NProgressInstance {
    configure(options: NProgressOptions): NProgressInstance
    start(): NProgressInstance
    done(force?: boolean): NProgressInstance
    set(progress: number): NProgressInstance
    inc(amount?: number): NProgressInstance
    trickle(): NProgressInstance
    status: number | null
  }

  const NProgress: NProgressInstance
  export default NProgress
}
