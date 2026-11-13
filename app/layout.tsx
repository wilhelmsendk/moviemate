import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title:'MovieMate · Find aftenens film',description:'Færre valg. Bedre filmaftener. Din personlige makker til Jellyfin.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'MovieMate',statusBarStyle:'black-translucent'}};
export const viewport: Viewport = { width:'device-width',initialScale:1,themeColor:'#10131b' };
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="da"><body>{children}</body></html>;}
