import { button, s } from 'motion/react-client'
import { AnimatePresence, motion } from 'framer-motion'
import React from 'react'

const CopyEmailButton = () => {
  const [copied, setCopied] = React.useState(false);
  const email = "altymysovfeliks@gmail.com";

  const copyEmailToClipboard = () => {
    navigator.clipboard.writeText(email);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }
  return (
    <motion.button className='relative px-1 py-4 text-sm text-center rounded-full bg-primary w-[12rem] cursor-pointer overflow-hidden font-extralight'
    onClick={copyEmailToClipboard}
    whileHover={{ y: -5 }}
    whileTap={{ scale: 1.05 }}>

      <AnimatePresence mode="wait">
      {copied ?
      <motion.p className='flex items-center justify-center gap-2'
      key="copied"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1 , y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}>
        <img src="assets/copy-done.svg" alt="copied" className='w-5' />
        Email Copied!
      </motion.p>
      :
      <motion.p className='flex items-center justify-center gap-2'
      key="copy"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1}}
      exit={{ opacity: 0}}
      transition={{ duration: 0.3 }}>
        <img src="assets/copy.svg" alt="copy icon" className='w-5' />
        Copy Email
      </motion.p>
      }
      </AnimatePresence>
    </motion.button>
  )
}

export default CopyEmailButton