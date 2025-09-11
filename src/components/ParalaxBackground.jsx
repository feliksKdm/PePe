import { section } from 'motion/react-client';
import React from 'react';

const ParalaxBackground = () => {
    return (
        <section className='absolute inset-0 bg-black/40'> 
        <div className='realtive h-screen overflow-hidden'>
            
            <div 
            className='absolute inset-0 w-full h-screen -z-50'
            style={{ backgroundImage: "url(/assets/sky.jpg", 
            backgroundSize: "cover",
            backgroundPosition: "center",
            }}></div>

            <div 
            className='absolute inset-0 w-full h-screen -z-40'
            style={{ backgroundImage: "url(/assets/planets.png", 
            backgroundSize: "cover",
            backgroundPosition: "center",
            }}></div>

            <div 
            className='absolute inset-0 w-full h-screen -z-30'
            style={{ backgroundImage: "url(/assets/mountain-3.png", 
            backgroundSize: "cover",
            backgroundPosition: "center",
            }}></div>

        </div> 
        

        </section>
    );
};

export { ParalaxBackground };
