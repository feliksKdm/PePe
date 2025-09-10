import { section } from 'motion/react-client';
import React from 'react';

const ParalaxBackground = () => {
    return (
        <section className='absolute inset-0 bg-black/40'> 
        <div className='realtive h-screen overflow-hidden'>
            
            <div 
            className='absolute inset-0 w-full h-screen -z-50'
            style={{ backgroundImage: "url(/assets/sky.jpg", }}>

        </div>
        
        </div> 
        

        </section>
    );
};

export { ParalaxBackground };
