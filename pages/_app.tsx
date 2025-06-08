import "@/styles/globals.css";
import type { AppProps } from "next/app";
// import { IBM_Plex_Sans_KR } from 'next/font/google'
import { Nanum_Myeongjo } from 'next/font/google'

// const ibmPlexSansKR = IBM_Plex_Sans_KR({
//   subsets: ['latin'],
//   weight: ['400', '500', '700'],
// })

const namum = Nanum_Myeongjo({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
})

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className={`${namum.className} font-sans`}>
      <Component {...pageProps} />
    </main>
  );
}
