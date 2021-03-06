import { createSilentAudio } from './empty.audio'

const TRANSITION_TIME = 0.2

const eventBus = require('./events')

const quint = (x: any) => 1 - Math.pow(1 - x, 3)

const concatBuffer = (...bufs: Array<any>) => {
  let len = bufs.length
  let bytelen = bufs.reduce((p, c) => p.length + c.length)

  let result = new Uint8Array(bytelen)

  for (var i = 0; i < len; i++) {
    let buf = bufs[i]

    let tmp = new Uint8Array(result.byteLength + buf.byteLength)
    tmp.set(result, 0)
    tmp.set(new Uint8Array(buf), result.byteLength)

    result = tmp
  }

  return result.buffer
}

class LLCTAudioSource {
  buffer: any
  events: eventBus
  loaded: number
  full: number
  src: string

  constructor () {
    this.buffer = null
    this.events = new eventBus()
    this.loaded = 0
    this.full = 0
  }

  progress (res) {
    const reader = res.body.getReader()

    let buffer = []

    this.full = Number(res.headers.get('Content-Length'))

    return new Promise(async (resolve, _) => {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          resolve(concatBuffer(...buffer))
          break
        }

        this.loaded += value.length

        this.events.run('loading', this.loaded, this.full)

        buffer.push(value)
      }
    })
  }

  load (url: string) {
    this.loaded = 0
    this.full = 0

    this.src = url

    fetch(url)
      .then(this.progress.bind(this))
      .then(v => {
        this.buffer = v

        this.events.run('load', v)
      })
      .catch(err => {
        this.buffer = null

        console.error(err)
        this.events.run('error', err)
      })
  }
}

export default class LLCTAudio {
  audio: LLCTAudioSource
  originVolume: number
  originBassVolume: number
  events: eventBus
  repeat: boolean
  paused: boolean
  loaded: boolean

  disableEffects: boolean
  useNative: boolean

  audioTime: number
  playbackRate: number

  supportMedia: boolean

  context: any
  loading: boolean

  savedBuffer: Object | ArrayBuffer
  audioElement?: HTMLAudioElement

  fadeTo: number
  fadeUntil: number

  convolver: ConvolverNode
  convolverSource: LLCTAudioSource

  compressor: DynamicsCompressorNode
  source: AudioBufferSourceNode

  wet: GainNode
  dry: GainNode

  destination: AudioDestinationNode
  latency: number | string
  sampleRate: number

  bassFilter: BiquadFilterNode
  useFadeInOut?: boolean

  prev?: Function
  next?: Function

  __lastTime: number
  __d: number

  constructor (
    noMediaSession: boolean,
    noEffects: boolean,
    useNativePlayer: boolean
  ) {
    this.audio = new LLCTAudioSource()
    this.originVolume = 0.75
    this.originBassVolume = 0
    this.events = new eventBus()
    this.repeat = false
    this.paused = true
    this.loading = false
    this.loaded = false

    this.disableEffects = noEffects

    this.useNative = useNativePlayer

    this.savedBuffer = new ArrayBuffer(0)

    this.audioTime = 0
    this.playbackRate = 1

    if (this.useNative) {
      this.initPlayer()
    } else {
      this.initAudioAPI()
    }

    this.supportMedia = !noMediaSession && navigator['mediaSession']

    if (navigator['mediaSession'] && !noMediaSession) {
      this.sessionInit()
    }

    this.audio.events.on('loading', (f, s) => this.events.run('loading', f, s))

    this.audio.events.on('load', data => {
      if (this.useNative) {
        if (this.context.src) {
          URL.revokeObjectURL(this.context.src)
        }

        this.context.setAttribute(
          'src',
          URL.createObjectURL(new Blob([data], { type: 'audio/mp3' }))
        )
        this.context.playbackRate = this.playbackRate

        this.context.addEventListener('canplaythrough', () => {
          this.loading = false
          this.loaded = true
          this.duration = this.context.duration

          this.events.run('playable')
        })

        return
      }

      this.context.decodeAudioData(
        data,
        (buffer: ArrayBuffer) => {
          this.currentTime = 0
          this.loading = false
          this.loaded = true

          this.savedBuffer = buffer

          if (!this.audioElement && this.supportMedia) {
            document
              .querySelectorAll('audio[data-empty-audio="1"]')
              .forEach(v => {
                URL.revokeObjectURL(v['src'])
              })

            this.audioElement = document.createElement('audio')
            this.audioElement.setAttribute('data-empty-audio', '1')
            this.audioElement.setAttribute('autoplay', 'true')
            this.audioElement.setAttribute('muted', 'true')
            this.audioElement['volume'] = 0

            document.querySelector('body').appendChild(this.audioElement)
          }

          this.events.run('playable')
        },

        e =>
          'Error with decoding audio data' + (typeof e === 'object' ? e.err : e)
      )
    })

    this.events.on('ended', () => {
      this.events.run('end')

      if (this.repeat) this.play()
    })

    this.events.on('seek', () => {
      this.destroySource()

      if (this.playing) {
        this.play(true)
      } else {
        this.pause()
      }
    })

    this.volume = 0.75
    this.bassVolume = 0
  }

  fadeOut () {
    this.fadeTo = 0
    this.fadeUntil = this.context.currentTime + TRANSITION_TIME
  }

  fadeIn () {
    this.fadeTo = this.volume
    this.fadeUntil = this.context.currentTime + TRANSITION_TIME
  }

  load (url) {
    setTimeout(() => {
      this.pause()
    }, 0)
    this.destroySource()

    this.loading = true

    this.audio.load(url)
    this.events.run('load')
  }

  createConvolver () {
    if (this.disableEffects) {
      return
    }

    if (this.useNative) {
      throw new Error(
        'This feature is supported in the Web Audio API mode, not in the native player mode.'
      )
    }

    this.convolver = this.context.createConvolver()
    this.convolverSource = new LLCTAudioSource()
    this.convolverSource.load('/assets/llct-effects-1.mp3')

    this.convolverSource.events.on('load', (data: ArrayBuffer) => {
      this.context.decodeAudioData(
        data,
        (buffer: AudioBuffer) => {
          this.convolver.buffer = buffer

          if (this.source) {
            this.source.connect(this.convolver)
          }

          this.convolver.connect(this.wet)
        },

        e => 'Error with decoding audio data' + e.err
      )
    })
  }

  createCompressor () {
    if (this.useNative) {
      throw new Error(
        'This feature is supported in the Audio API mode, not native player mode.'
      )
    }

    this.compressor = this.context.createDynamicsCompressor()
    this.compressor.connect(this.destination)

    this.compressor.threshold.value = -30
    this.compressor.knee.value = 40
    this.compressor.ratio.value = 6
    this.compressor.attack.value = 0.02
    this.compressor.release.value = 0.025
  }

  destroyConvolver () {
    if (this.useNative) {
      throw new Error(
        'This feature is supported in the Audio API mode, not native player mode.'
      )
    }

    if (this.convolver) {
      this.convolver.disconnect()
      delete this.convolver
    }
  }

  destroyCompressor () {
    if (this.useNative) {
      throw new Error(
        'This feature is supported in the Audio API mode, not native player mode.'
      )
    }

    if (this.compressor) {
      this.compressor.disconnect()
      delete this.compressor
    }
  }

  initPlayer () {
    this.context = document.createElement('audio')
    document.querySelector('body').appendChild(this.context)
  }

  initAudioAPI () {
    // Web Audio API
    this.context = new (window.AudioContext || window['webkitAudioContext'])()
    this.destination = this.context.destination
    this.latency =
      this.context.baseLatency && (this.context.baseLatency * 1000).toFixed(2)
    this.sampleRate = this.context.sampleRate

    this.createCompressor()

    this.dry = this.context.createGain()
    this.wet = this.context.createGain()

    this.bassFilter = this.context.createBiquadFilter()
    this.bassFilter.type = 'lowshelf'
    this.bassFilter.frequency.value = 145
    this.bassFilter.Q.value = 40
    this.bassFilter.gain.value = this.bassVolume

    this.dry.connect(this.bassFilter)
    this.bassFilter.connect(this.compressor)

    //this.dry.connect(this.compressor)
    this.wet.connect(this.compressor)

    let timing = () => {
      if (this.playing && this.__lastTime) {
        this.currentTime +=
          ((performance.now() - this.__lastTime) / 1000) * this.playbackRate
      }
      this.__lastTime = performance.now()

      if (typeof this.fadeTo !== 'undefined') {
        let e = quint(
          Math.max(
            0,
            Math.min(
              0.3,
              this.fadeTo > 0
                ? this.context.currentTime - this.fadeUntil
                : this.fadeUntil - this.context.currentTime
            )
          ) / TRANSITION_TIME
        )

        this.dry.gain.value = Math.min(
          1,
          this.volume * e * (this.convolver ? 0.77 : 1)
        )

        if (this.fadeTo > 0) {
          this.wet.gain.value = Math.min(1, this.volume * e * 0.23)
        }

        if (this.fadeUntil + 0.1 < this.context.currentTime) {
          this.fadeTo = undefined
          this.fadeUntil = undefined
        }
      }

      if (this.duration <= this.currentTime) {
        this.paused = true
        this.currentTime = 0

        this.events.run('ended')
      }

      requestAnimationFrame(timing)
    }

    requestAnimationFrame(() => {
      timing()
    })

    if (!this.disableEffects) {
      this.liveEffect(localStorage.getItem('LLCT.Audio.LiveEffects') == 'true')
    }
  }

  liveEffect (toggle) {
    if (this.useNative) {
      throw new Error(
        'This feature is supported in the Audio API mode, not native player mode.'
      )
    }

    if (toggle) {
      this.createConvolver()
    } else {
      this.destroyConvolver()
    }
  }

  createSource (buffer: AudioBuffer) {
    if (this.useNative) {
      throw new Error(
        'This feature is supported in the Audio API mode, not native player mode.'
      )
    }

    if (this.source) {
      try {
        this.destroySource()
      } catch (e) {}
    }

    this.source = this.context.createBufferSource()

    this.source.buffer = buffer || this.savedBuffer
    this.source.playbackRate.value = this.playbackRate
    this.duration = (buffer || this.savedBuffer || {}).duration

    this.source.connect(this.dry)

    if (this.convolver) {
      this.source.connect(this.convolver)
    }
  }

  destroySource () {
    this.loaded = false

    if (this.source) {
      this.source.stop()
      this.source.buffer = null
      delete this.source
    }
  }

  get src () {
    return this.audio.src
  }

  get playing () {
    return !this.paused
  }

  get bassVolume () {
    return this.originBassVolume
  }

  set bassVolume (v) {
    if (typeof v === 'string') v = Number(v)

    this.originBassVolume = v

    if (!this.useNative) {
      this.bassFilter.gain.value = v
    }
  }

  get volume () {
    return this.originVolume
  }

  set volume (v) {
    if (typeof v === 'string') v = Number(v)

    this.originVolume = v

    if (this.useNative) {
      this.context.volume = v
    } else {
      this.dry.gain.value = v * (this.convolver ? 0.77 : 1)
      this.wet.gain.value = v * 0.23
    }
  }

  get speed () {
    return this.playbackRate
  }

  set speed (v) {
    this.playbackRate = v

    if (this.useNative) {
      this.context.playbackRate = v
    } else {
      if (this.source && this.source.playbackRate) {
        this.source.playbackRate.value = v
      }
    }
  }

  volumeDown (v: number) {
    this.volume = this.volume - v < 0 ? 0 : this.volume - v
  }

  volumeUp (v: number) {
    this.volume = this.volume + v > 1 ? 1 : this.volume + v
  }

  get progress () {
    return this.currentTime / this.duration
  }

  set progress (per) {
    this.currentTime = this.duration * per
    this.events.run('seek')
  }

  get time () {
    return this.currentTime
  }

  set time (t) {
    this.currentTime = t
    this.events.run('seek')
  }

  stop () {
    this.pause()
    this.load(null)
  }

  seekPrev (t) {
    this.audioTime = Math.max(0, this.audioTime - t)
    this.events.run('seek')
  }

  seekNext (t) {
    this.audioTime = Math.min(this.duration, this.audioTime + t)
    this.events.run('seek')
  }

  repeatToggle () {
    this.repeat = !this.repeat
  }

  setMetadata (title: string, artist: string, cover: string) {
    if (this.supportMedia) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: artist,
        artwork: [{ src: cover }]
      })
    }
  }

  play (skipFade?: boolean) {
    if (this.supportMedia) {
      navigator.mediaSession.playbackState = 'playing'
    }

    try {
      if (this.useNative) {
        this.context.play()
      } else {
        this.createSource(this.savedBuffer)
        this.source.start(this.context.currentTime, this.audioTime)

        if (this.audioElement) {
          if (
            !this.audioElement.src ||
            this.audioElement.getAttribute('data-duration') !=
              this.duration.toString()
          ) {
            this.audioElement.src = createSilentAudio(
              Math.round(this.duration),
              44100
            )

            this.audioElement.setAttribute(
              'data-duration',
              this.duration.toString()
            )
          }

          this.audioElement.play()
        }
      }

      if (this.useFadeInOut && !skipFade) {
        this.fadeIn()
      }

      this.paused = false
    } catch (e) {
      console.error(e)
    }

    this.events.run('play')
  }

  pause () {
    if (this.supportMedia) {
      navigator.mediaSession.playbackState = 'paused'
    }

    if (this.paused) {
      this.events.run('pause')
      return
    }

    try {
      if (this.useNative) {
        this.context.pause()
      } else {
        if (this.source) {
          this.source.stop(
            this.context.currentTime + (this.useFadeInOut ? 0.3 : 0)
          )
        }

        if (this.audioElement) {
          this.audioElement.pause()
        }
      }
    } catch (e) {
      console.error(e)
    }

    if (this.useFadeInOut) {
      this.fadeOut()
    }

    this.paused = true
    this.events.run('pause')
  }

  playPause () {
    this[this.playing ? 'pause' : 'play']()
  }

  get currentTime () {
    return this.useNative ? this.context.currentTime : this.audioTime
  }

  set currentTime (v) {
    if (this.useNative) {
      this.context.currentTime = v
    } else {
      this.audioTime = v
    }
  }

  get duration () {
    return this.__d
  }

  set duration (v) {
    this.__d = v
  }

  timecode () {
    return this.currentTime * 100
  }

  sessionInit () {
    navigator.mediaSession.setActionHandler('play', () => {
      this.play()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      this.pause()
    })
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      this.prev()
    })
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      this.next()
    })
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      this.seekPrev(5)
    })
    navigator.mediaSession.setActionHandler('seekforward', () => {
      this.seekNext(5)
    })
  }
}
