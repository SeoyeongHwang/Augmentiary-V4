import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { Noto_Serif_KR } from 'next/font/google'
import { IBM_Plex_Sans_KR } from 'next/font/google'
import { Nanum_Myeongjo } from 'next/font/google'

const ibmPlexSansKR = IBM_Plex_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

const namum = Nanum_Myeongjo({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
})

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className={`${namum.className} ${ibmPlexSansKR.className} font-sans`}>
      <Component {...pageProps} />
    </main>
  );
}
