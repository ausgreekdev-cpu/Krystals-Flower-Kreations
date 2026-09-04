import React from 'react';
export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={ hasError:false, error:null }; }
  static getDerivedStateFromError(error){ return { hasError:true, error }; }
  componentDidCatch(error, info){ console.error('ErrorBoundary', error, info); }
  render(){
    if(this.state.hasError){
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <div className="bg-white border rounded-2xl p-6 max-w-md w-full text-center">
            <h2 className="font-black text-bloom-700">Something went wrong</h2>
            <p className="text-sm text-gray-600 mt-2">{String(this.state.error?.message || this.state.error).slice(0,300)}</p>
            <button onClick={()=>window.location.reload()} className="mt-4 bg-bloom-500 text-white px-4 py-2 rounded-xl text-sm font-bold">Reload</button>
            <button onClick={()=>{ this.setState({ hasError:false, error:null }); window.location.href='/'; }} className="ml-2 border px-4 py-2 rounded-xl text-sm">Home</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
