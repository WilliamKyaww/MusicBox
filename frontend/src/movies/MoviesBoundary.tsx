import { Component, type ReactNode } from 'react'
import { experiencePath } from '../experience'

/**
 * A failed optional workspace must not unmount the shared audio player. Navigating
 * (a new `resetKey`) clears the failure without remounting the workspace.
 */
export class MoviesBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidUpdate(previous: { resetKey: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <section className="status-panel status-panel--error" role="alert">
      <h1>Movies Could Not Be Displayed</h1>
      <p>An unexpected Movies error occurred. Your Video and Music experiences remain available.</p>
      <p><a href={experiencePath('video')}>Return to Video</a> / <a href={experiencePath('music')}>Return to Music</a></p>
      <button type="button" onClick={() => this.setState({ failed: false })}>Retry Movies</button>
    </section>
  }
}
