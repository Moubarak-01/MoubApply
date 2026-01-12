import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { api } from '../services/api';
import { Loader2, MessageSquare, Send, Trash2, X, Copy, Edit2, Check, GripHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import MessageContent from './MessageContent';

export interface AiAssistantRef {
  openChat: () => void;
  toggleVisibility: () => void;
  toggleOpen: () => void;
}

interface AiAssistantProps {
  userId: string | null;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

const MODELS = [
    { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small (Free)' },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)' },
    { id: 'anthropic/claude-3.7-sonnet:thinking', name: 'Claude 3.7 Thinking' },
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' },
    { id: 'anthropic/claude-opus-4.5', name: 'Claude 4.5 Opus' },
    { id: 'openai/o3-mini', name: 'OpenAI o3-mini' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B' },
    { id: 'perplexity/sonar-reasoning-pro', name: 'Sonar Reasoning Pro' },
    { id: 'qwen/qwen3-4b:free', name: 'Qwen 3 4B' },
    { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro' },
    { id: 'mistralai/mistral-large', name: 'Mistral Large' },
    { id: 'google/gemma-3-27b-it', name: 'Gemma 3 27B' },
    { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
    { id: 'google/gemini-2.0-pro-exp:free', name: 'Gemini 2.0 Pro (Free)' },
    { id: 'deepseek/deepseek-r1-distill-llama-70b:free', name: 'DeepSeek R1 Distill (Free)' },
    { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 (Uncensored Free)' },
    { id: 'microsoft/phi-3-medium-128k-instruct:free', name: 'Phi-3 Medium (Free)' },
    { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B (Free)' },
    { id: 'mistralai/mistral-nemo:free', name: 'Mistral Nemo (Free)' },
    { id: 'openchat/openchat-7b:free', name: 'OpenChat 3.5 (Free)' },
    { id: 'huggingfaceh4/zephyr-7b-beta:free', name: 'Zephyr 7B (Free)' },
    { id: 'liquid/lfm-40b:free', name: 'Liquid LFM 40B (Free)' },
    { id: 'allenai/molmo-7b:free', name: 'Molmo 7B (Vision Free)' },
    { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B (Free)' }
];

const AiAssistant = forwardRef<AiAssistantRef, AiAssistantProps>(({ userId }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: "Hello! I'm your MoubApply Career Assistant. How can I help with your job search today?" }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [showThinkingLoader, setShowThinkingLoader] = useState(false);
  const [hasStartedStreaming, setHasStartedStreaming] = useState(false);

  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: window.innerHeight - 600 });
  const [size, setSize] = useState({ width: 400, height: 550 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  
  const chatRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);

  const handleScroll = () => {
      if (scrollContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
          isUserAtBottomRef.current = scrollHeight - scrollTop - clientHeight <= 50; 
      }
  };

  useEffect(() => {
    if (isUserAtBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, messages[messages.length - 1]?.text]);

  useEffect(() => {
      let timer: any;
      if (isThinking && !hasStartedStreaming) {
          timer = setTimeout(() => { if (!hasStartedStreaming) setShowThinkingLoader(true); }, 1000); 
      } else {
          setShowThinkingLoader(false);
      }
      return () => clearTimeout(timer);
  }, [isThinking, hasStartedStreaming]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!chatRef.current || !isOpen || (e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('textarea')) return;
    setIsDragging(true);
    setOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleResizeDown = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsResizing(true);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: Math.min(Math.max(0, e.clientX - offset.x), window.innerWidth - 50),
                y: Math.min(Math.max(0, e.clientY - offset.y), window.innerHeight - 50),
            });
        }
        if (isResizing) {
            setSize({
                width: Math.max(300, e.clientX - position.x),
                height: Math.max(400, e.clientY - position.y),
            });
        }
    };
    const onUp = () => {
        setIsDragging(false);
        setIsResizing(false);
    };
    if (isDragging || isResizing) {
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }
    return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, isResizing, offset, position]);

  useImperativeHandle(ref, () => ({
    openChat: () => setIsOpen(true),
    toggleVisibility: () => setIsVisible(prev => !prev),
    toggleOpen: () => setIsOpen(prev => !prev),
  }));

  const handleCopy = (text: string, index: number) => {
      navigator.clipboard.writeText(text);
      setCopiedId(index);
      setTimeout(() => setCopiedId(null), 2000);
  };

  const handleEdit = (text: string, index: number) => {
      setMessages(prev => prev.slice(0, index));
      setInputValue(text);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isThinking || !userId) return;

    const randomModel = MODELS[Math.floor(Math.random() * MODELS.length)].id;
    const userText = inputValue.trim();
    setMessages(prev => [...prev, { role: 'user', text: userText }, { role: 'model', text: '' }]);
    setInputValue('');
    setIsThinking(true);
    setHasStartedStreaming(false);
    setShowThinkingLoader(false);
    isUserAtBottomRef.current = true;

    try {
      const response = await fetch('http://localhost:5000/api/ai/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, message: userText, model: randomModel })
      });

      if (!response.ok || !response.body) throw new Error("Stream failed");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponseText = '';

      while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          setHasStartedStreaming(true);
          setShowThinkingLoader(false);
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
              if (line.startsWith('data: ')) {
                  const dataStr = line.replace('data: ', '');
                  if (dataStr === '[DONE]') break;
                  try {
                      const data = JSON.parse(dataStr);
                      if (data.content) {
                          aiResponseText += data.content;
                          setMessages(prev => {
                              const newMessages = [...prev];
                              const lastMsg = newMessages[newMessages.length - 1];
                              if (lastMsg.role === 'model') lastMsg.text = aiResponseText;
                              return newMessages;
                          });
                      }
                  } catch (e) {}
              }
          }
      }
    } catch (error) {
      setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: 'model', text: "Error. Check backend." };
          return newMessages;
      });
    } finally {
      setIsThinking(false);
      setHasStartedStreaming(false);
      setShowThinkingLoader(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div ref={chatRef} style={isOpen ? { position: 'fixed', top: `${position.y}px`, left: `${position.x}px`, width: `${size.width}px`, height: `${size.height}px`, zIndex: 9999 } : { position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999 }} className={clsx("transition-all duration-200 ease-out", (isDragging || isResizing) && "transition-none")}>
      {!isOpen ? (
        <button onClick={() => setIsOpen(true)} className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-indigo-700 transition-transform active:scale-95"><MessageSquare className="w-7 h-7" /></button>
      ) : (
        <div className="w-full h-full bg-white rounded-2xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden relative">
          <div onMouseDown={handleMouseDown} className="p-4 bg-indigo-600 text-white flex justify-between items-center cursor-grab active:cursor-grabbing select-none">
            <div className="flex items-center gap-2"><MessageSquare className="w-5 h-5" /><h3 className="font-bold text-sm uppercase tracking-widest">Assistant</h3></div>
            <div className="flex items-center gap-2">
                <button onClick={() => setMessages([{ role: 'model', text: "Cleared." }])} className="p-1 hover:bg-indigo-50 rounded-lg text-indigo-100 hover:text-white transition-colors" title="Clear Chat"><Trash2 className="w-4 h-4" /></button>
                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-indigo-50 rounded-lg text-indigo-100 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-6 bg-white scrollbar-thin">
            {messages.map((msg, i) => (
              <div key={i} className={clsx("flex w-full group", msg.role === 'user' ? "justify-end" : "justify-start")}>
                {msg.role === 'user' ? (
                    <div className="relative max-w-[85%]">
                        <div className="bg-slate-100 text-slate-800 px-4 py-3 rounded-2xl rounded-tr-sm border border-slate-200 shadow-sm text-sm"><MessageContent content={msg.text} isUser={true} /></div>
                        <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEdit(msg.text, i)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleCopy(msg.text, i)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors">{copiedId === i ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}</button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full pr-2 text-slate-800 text-sm leading-relaxed relative">
                        {(msg.text !== '' || !showThinkingLoader) && (
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Assistant</div>
                                <button onClick={() => handleCopy(msg.text, i)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 rounded transition-opacity">{copiedId === i ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}</button>
                            </div>
                        )}
                        <MessageContent content={msg.text} isUser={false} />
                    </div>
                )}
              </div>
            ))}
            {showThinkingLoader && !hasStartedStreaming && (
               <div className="w-full space-y-3 p-2 animate-pulse">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><Loader2 className="w-3 h-3 animate-spin" /> Thinking</div>
                  <div className="space-y-2"><div className="h-2 bg-slate-100 rounded w-full"></div><div className="h-2 bg-slate-100 rounded w-[90%]"></div><div className="h-2 bg-slate-100 rounded w-[75%]"></div></div>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-100 flex items-end gap-2">
            <textarea value={inputValue} onChange={(e) => { setInputValue(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`; }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} placeholder="Message..." rows={1} className="flex-1 px-4 py-2.5 bg-slate-100 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none overflow-y-auto max-h-[150px]" />
            <button type="submit" disabled={!inputValue.trim() || isThinking} className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-100"><Send className="w-5 h-5" /></button>
          </form>
          <div onMouseDown={handleResizeDown} className="absolute bottom-0 right-0 p-1 cursor-nwse-resize hover:bg-slate-100 text-slate-300 hover:text-indigo-500 transition-colors rounded-tl-lg"><GripHorizontal className="w-4 h-4 transform rotate-45" /></div>
        </div>
      )}
    </div>
  );
});

export default AiAssistant;