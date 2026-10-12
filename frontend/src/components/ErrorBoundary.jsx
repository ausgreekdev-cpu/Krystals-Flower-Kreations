import React from 'react';
import Btn from './ui/Btn';
export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={ hasError:false, error:null }; }
  static getDerivedStateFromError(error){ return { hasError:true, error }; }
  componentDidCatch(error, info){ console.error('ErrorBoundary', error, info); }
  render(){
    if(this.state.hasError){
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <div className="bg-surface2 border rounded-2xl p-6 max-w-md w-full text-center">
            <h2 className="font-black text-ink">Something went wrong</h2>
            <p className="text-sm text-muted mt-2">{String(this.state.error?.message || this.state.error).slice(0,300)}</p>
            <div className="mt-4 flex gap-2 justify-center">
              <Btn onClick={()=>window.location.reload()} variant="primary" size="md">Reload</Btn>
              <Btn onClick={()=>{ this.setState({ hasError:false, error:null }); window.location.href='/'; }} variant="outline" size="md">Home</Btn>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
