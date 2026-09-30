import React from 'react';
import './map.css';

// Offline, hand-drawn map for the filmed prototype. This is deliberately a
// schematic of the Ghent area, not a source of real navigation instructions.
const streets = [
 'M-20 68 L97 97 175 73 220 39 290 28',
 'M-30 116 L66 132 121 112 194 139 262 130 312 94 387 83',
 'M-20 171 L67 181 127 162 189 179 240 167 293 183',
 'M21 30 L43 83 66 132 67 181 83 226 71 284 101 331',
 'M91 4 L97 97 121 112 127 162 147 210 137 258 157 302',
 'M166 -12 L175 73 194 139 189 179 209 224 199 266 223 318',
 'M240 -14 L220 39 242 78 262 130 240 167 264 216',
 'M312 -15 L290 28 312 94 326 145 293 183 304 225',
 'M390 -10 L387 83 403 128 377 173 385 215',
 'M242 78 L312 94 341 66 387 83 436 73 495 88',
 'M293 183 L326 145 368 136 403 128 448 153 473 196',
 'M264 216 L304 225 343 207 377 173 414 188 455 223',
 'M209 224 L264 216 278 258 321 269 355 251 385 215 414 236',
 'M199 266 L232 279 278 258 288 304 337 311 366 284 414 287',
 'M223 318 L250 334 288 304 294 356 341 351 375 330 414 348',
 'M71 284 L137 258 163 277 199 266 232 279',
 'M101 331 L157 302 178 333 223 318 250 334',
 'M-20 289 L71 284 M-20 353 L40 368 101 331',
 'M40 368 L74 420 121 446 166 430 215 439 253 410',
 'M101 331 L119 373 166 430 M157 302 L178 333 196 389 215 439',
 'M223 318 L231 367 253 410 279 443 320 461',
 'M119 373 L171 355 231 367 267 365 294 356 341 351',
 'M253 410 L302 398 349 407 389 383 435 386 472 409',
 'M279 443 L326 432 349 407 369 451 418 436 445 460',
 'M320 461 L344 490 395 475 418 436 435 386',
 'M414 287 L445 309 482 302 502 331 479 359 435 386',
 'M414 348 L445 309 M482 302 L502 271 552 282 570 320',
 'M445 460 L481 433 472 409 510 390 554 401',
 'M455 223 L485 210 529 227 552 282 M502 271 L529 227',
 'M436 73 L465 26 525 4 M495 88 L532 45 592 44 637 67',
 'M403 128 L459 112 495 88 526 124 573 113 607 140',
 'M448 153 L493 163 526 124 M473 196 L517 180 557 190 607 178',
 'M592 44 L605 93 637 119 607 140 607 178 642 205',
 'M529 227 L570 224 607 178 M557 190 L573 113',
 'M637 67 L695 80 715 119 691 163 718 205',
 'M637 119 L681 123 715 119 773 96 809 112',
 'M642 205 L691 163 737 165 771 191 808 181',
 'M570 224 L596 270 652 257 678 282 724 257',
 'M552 282 L570 320 609 305 648 327 678 282',
 'M570 320 L603 354 648 327 683 352 713 318',
 'M510 390 L553 354 603 354 629 389 659 397',
 'M552 282 L596 270 M652 257 L642 205 M718 205 L724 257',
 'M701 -10 L695 80 M769 -10 L773 96 M849 -10 L844 66 809 112',
 'M895 24 L938 68 989 62 1025 26 1090 9',
 'M866 74 L908 106 938 68 977 115 1010 142',
 'M840 125 L877 154 908 106 947 143 977 115',
 'M810 170 L848 198 877 154 915 188 947 143',
 'M787 218 L827 243 848 198 892 236 915 188',
 'M770 263 L814 290 827 243 864 271 892 236',
 'M739 302 L781 335 814 290 851 326 864 271',
 'M715 352 L758 378 781 335 822 368 851 326',
 'M684 393 L726 423 758 378 794 411 822 368',
 'M658 433 L701 466 726 423 765 451 794 411',
 'M629 474 L670 509 701 466 741 502 765 451',
 'M597 516 L640 551 670 509 708 545 741 502',
 'M564 552 L608 591 640 551 680 585 708 545',
 'M915 188 L951 214 977 181 1010 142 1048 173 1082 143 1120 166',
 'M892 236 L928 265 951 214 991 247 1023 215 1048 173',
 'M864 271 L905 305 928 265 969 299 991 247',
 'M851 326 L886 349 905 305 944 339 969 299 1012 331',
 'M822 368 L858 398 886 349 923 385 944 339',
 'M794 411 L835 444 858 398 897 428 923 385',
 'M765 451 L804 482 835 444 870 475 897 428',
 'M741 502 L780 530 804 482 844 515 870 475',
 'M708 545 L752 572 780 530 821 562 844 515',
 'M680 585 L722 615 752 572 797 599 821 562',
 'M1025 26 L1049 75 1090 97 1120 166 1166 191 1215 175',
 'M977 115 L1049 75 M1048 173 L1090 210 1133 247 1186 230 1223 265',
 'M991 247 L1037 269 1090 210 M969 299 L1037 269 1061 315 1108 341 1150 324 1220 351',
 'M1012 331 L1061 315 M923 385 L965 413 1002 375 1045 407 1108 341',
 'M897 428 L937 462 965 413 1017 455 1045 407 1091 437 1136 414 1210 431',
 'M870 475 L912 504 937 462 M844 515 L891 551 912 504 958 538 1017 455',
 'M821 562 L858 601 891 551 931 590 958 538 1005 571 1060 548',
 'M1045 407 L1091 437 1090 493 1134 526 1191 495 1220 519',
 'M1017 455 L1050 504 1090 493 M958 538 L1005 571 1060 548 1105 582 1134 526',
 'M-20 464 L70 493 128 468 166 494 215 479 255 510 291 501',
 'M-20 519 L52 541 91 525 133 553 166 494 M70 493 L91 525',
 'M-20 577 L45 588 87 570 133 553 166 596 210 569 255 590',
 'M52 541 L45 588 62 634 112 651 166 626 166 596',
 'M215 479 L225 539 255 590 M128 468 L121 446 M291 501 L316 541',
 'M166 494 L210 518 225 539 271 546 316 541 358 563',
 'M210 569 L210 518 M255 590 L271 546 M291 501 L344 490',
 'M-15 649 L62 634 M112 651 L109 721 M166 626 L192 674 223 715',
 'M62 634 L42 699 M166 626 L226 631 255 662 300 642',
 'M226 631 L255 590 M192 674 L255 662 265 715',
 'M367 729 L395 678 444 700 484 665 528 687 563 655 611 686',
 'M484 665 L487 733 M528 687 L539 737 M611 686 L630 734',
 'M698 733 L723 678 773 697 802 668 853 698 886 669',
 'M853 698 L871 739 M886 669 L933 694 980 671 1022 701 1075 674 1106 704 1159 676 1209 702',
];

const avenues = [
 'M-20 226 C110 239 163 241 232 279 S340 311 414 287 S572 338 629 389 L674 399',
 'M-20 397 C69 387 152 393 231 367 S350 351 414 348 C464 347 525 370 554 401 L609 448',
 'M298 -20 C332 54 341 117 343 207 S344 315 349 407 C365 483 398 532 448 588',
 'M559 -20 C538 57 549 105 557 190 S566 297 553 354 C546 420 546 464 540 519',
 'M749 -20 C759 51 736 99 737 165 S765 219 770 263 C799 290 867 327 923 385 L1017 455 1105 582 1210 635',
 'M1210 295 C1091 289 1032 316 969 299 L864 271 770 263 C731 260 677 251 652 257',
 'M1220 558 C1112 567 1069 600 1005 610 S886 612 821 562 L741 502 674 451',
 'M140 719 C167 653 204 620 255 590 S342 561 395 550 L447 564',
];

const ring = 'M215 -20 C197 49 164 100 167 164 C170 215 156 255 178 333 C196 389 242 453 320 461 C418 469 475 446 510 390 C555 321 566 259 552 198 C538 134 496 82 495 23 L496 -20';
const motorway = 'M238 756 C278 676 374 651 459 594 C548 535 597 477 674 399 C755 316 828 224 895 133 C943 68 981 17 1020 -42';
const e40 = 'M-35 612 C120 571 229 591 330 624 C438 659 527 645 650 644 C823 643 952 669 1096 617 L1236 559';
const river = 'M462 -30 C446 35 420 65 438 99 C460 140 428 166 438 205 C448 252 475 243 480 284 C485 324 461 340 481 365 C505 395 533 386 547 421 C562 458 590 487 622 508 C652 528 649 552 643 577 C635 610 644 628 659 650 C677 678 679 719 683 742';

export default function CarMap({traffic=true,className=''}) {
 return <div className={`car-map ${traffic?'has-traffic':''} ${className}`}>
  <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-label="Illustrated demonstration navigation map of the Ghent area" role="img">
   <defs>
    <radialGradient id="car-map-shade"><stop offset="0" stopColor="#172025" stopOpacity="0"/><stop offset="1" stopColor="#091014" stopOpacity=".35"/></radialGradient>
    <radialGradient id="car-position-halo"><stop offset="0" stopColor="#86bcff" stopOpacity=".18"/><stop offset="1" stopColor="#86bcff" stopOpacity="0"/></radialGradient>
    <filter id="car-arrow-shadow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#06121d" floodOpacity=".7"/></filter>
   </defs>
   <rect width="1200" height="700" fill="#182227"/>
   <g className="map-neighbourhoods">
    <path d="M35 73 189 84 230 170 178 259 77 275 38 178Z"/><path d="M208 61 383 65 408 201 302 262 216 216Z"/>
    <path d="M198 279 295 267 423 302 451 379 358 433 247 400Z"/><path d="M515 119 692 106 714 203 623 285 544 241Z"/>
    <path d="M899 115 1049 122 1122 226 1056 287 926 223Z"/><path d="M829 274 1004 337 997 481 887 507 766 414Z"/>
    <path d="M64 412 195 444 255 533 159 573 51 532Z"/><path d="M753 484 859 538 934 624 788 631 685 577Z"/>
   </g>
   <g className="map-parks">
    <path d="M20 37 38 18 81 25 78 72 55 88 21 69Z"/>
    <path d="M207 320 241 296 277 314 286 355 267 390 227 387 209 354Z"/>
    <path d="M363 386 406 368 427 392 417 427 382 444 369 420Z"/>
    <path d="M508 245 540 244 558 272 536 314 511 304 502 278Z"/>
    <path d="M1025 281 1063 268 1116 282 1133 321 1102 351 1056 330Z"/>
    <path d="M924 405 965 411 982 438 966 461 938 462 914 442Z"/>
    <path d="M994 434 1030 406 1087 440 1063 499 1012 496Z"/>
    <path d="M-15 462 28 441 61 464 65 504 32 521 -10 502Z"/>
    <path d="M443 684 470 690 482 713 475 744 430 741 424 709Z"/>
    <path d="M823 34 838 14 879 17 895 49 868 80 841 69Z"/>
   </g>
   <g className="map-water">
    <path d={river}/>
    <path d="M-35 244 C69 253 100 296 165 308 C200 315 226 302 267 288 C316 271 316 228 356 213 C387 201 411 224 438 205"/>
    <path d="M356 213 C363 178 388 168 414 157 C439 145 444 126 438 99"/>
    <path d="M438 99 C487 85 500 65 506 33 L515 -20"/>
    <path d="M659 650 C706 660 739 650 776 665 C823 685 838 714 855 739"/>
   </g>
   <g className="map-minor-casing">{streets.map((d,i)=><path d={d} key={i}/>)}</g>
   <g className="map-local-roads">{streets.map((d,i)=><path d={d} key={i}/>)}</g>
   <g className="map-major-casing">{avenues.map((d,i)=><path d={d} key={i}/>)}<path d={ring}/></g>
   <g className="map-avenues">{avenues.map((d,i)=><path d={d} key={i}/>)}<path d={ring}/></g>
   <g className="map-interchange-casing"><path d="M384 640 C412 615 443 605 464 623 C482 640 445 659 442 685"/><path d="M457 595 C464 614 492 627 525 631"/><path d="M336 669 C348 647 357 633 385 623"/><path d="M529 641 C513 661 483 675 461 686"/><path d="M624 453 C611 431 576 415 554 401"/><path d="M603 492 C593 466 599 447 629 438"/></g>
   <g className="map-interchanges"><path d="M384 640 C412 615 443 605 464 623 C482 640 445 659 442 685"/><path d="M457 595 C464 614 492 627 525 631"/><path d="M336 669 C348 647 357 633 385 623"/><path d="M529 641 C513 661 483 675 461 686"/><path d="M624 453 C611 431 576 415 554 401"/><path d="M603 492 C593 466 599 447 629 438"/></g>
   <path className="map-motorway-casing" d={e40}/><path className="map-motorway" d={e40}/><path className="map-motorway-centre" d={e40}/>
   <path className="map-motorway-casing" d={motorway}/><path className="map-motorway" d={motorway}/>
   <path className="map-route-outline" d={motorway}/><path className="map-route" d={motorway}/>
   {traffic&&<g className="map-traffic"><path className="map-traffic-amber" d="M622 451 C643 429 659 414 674 399 C706 366 736 331 766 295"/><path className="map-traffic-red" d="M622 451 C643 429 659 414 674 399 C688 384 702 369 715 354"/></g>}
   <g className="map-place-labels">
    <text className="map-city" x="306" y="178" textAnchor="middle">Gent</text>
    <text className="map-district" x="88" y="360" textAnchor="middle">Ekkergem</text>
    <text className="map-district" x="466" y="64" textAnchor="middle">Dampoort</text>
    <text className="map-district" x="876" y="89" textAnchor="middle">Destelbergen</text>
    <text className="map-district" x="878" y="380" textAnchor="middle">Gentbrugge</text>
    <text className="map-district" x="558" y="381" textAnchor="middle">Ledeberg</text>
    <text className="map-district" x="182" y="504" textAnchor="middle">Sint-Denijs-Westrem</text>
    <text className="map-district" x="365" y="598" textAnchor="middle">Zwijnaarde</text>
    <text className="map-district" x="821" y="678" textAnchor="middle">Merelbeke</text>
    <text className="map-park-label" x="243" y="350" textAnchor="middle"><tspan x="243">Citadel</tspan><tspan x="243" dy="13">park</tspan></text>
    <text className="map-park-label" x="1075" y="303" textAnchor="middle"><tspan x="1075">Gentbrugse</tspan><tspan x="1075" dy="13">Meersen</tspan></text>
    <text className="map-water-label" x="500" y="331" transform="rotate(72 500 331)">Schelde</text>
    <text className="map-water-label" x="82" y="276" transform="rotate(21 82 276)">Leie</text>
    <text className="map-road-label" x="319" y="379" transform="rotate(-2 319 379)">Kortrijksesteenweg</text>
    <text className="map-road-label" x="894" y="533" transform="rotate(33 894 533)">Brusselsesteenweg</text>
    <text className="map-road-label" x="158" y="204" transform="rotate(82 158 204)">Rooigemlaan</text>
    <text className="map-road-label" x="564" y="189" transform="rotate(81 564 189)">Brabantdam</text>
   </g>
   <g className="map-route-shield" transform="translate(812 210)"><rect x="-18" y="-11" width="36" height="22" rx="4"/><text textAnchor="middle" y="4">E17</text></g>
   <g className="map-route-shield" transform="translate(434 616)"><rect x="-18" y="-11" width="36" height="22" rx="4"/><text textAnchor="middle" y="4">E17</text></g>
   <g className="map-route-shield" transform="translate(1035 636)"><rect x="-18" y="-11" width="36" height="22" rx="4"/><text textAnchor="middle" y="4">E40</text></g>
   <g className="map-route-shield secondary" transform="translate(192 372)"><rect x="-16" y="-10" width="32" height="20" rx="4"/><text textAnchor="middle" y="4">R40</text></g>
   <g className="map-destination" transform="translate(917 103)"><circle r="10"/><circle r="4"/><path d="M14 -13h68a5 5 0 0 1 5 5V8a5 5 0 0 1-5 5H14z"/><text x="49" y="4" textAnchor="middle">Antwerpen</text></g>
   <rect width="1200" height="700" fill="url(#car-map-shade)" pointerEvents="none"/>
   <g className="map-car-position" transform="translate(613 460)"><circle className="map-position-glow" r="65" fill="url(#car-position-halo)"/><circle className="map-position-ring" r="31"/><g transform="rotate(42)" filter="url(#car-arrow-shadow)"><path className="map-car-arrow-outline" d="M0 -25 20 21 0 13 -20 21Z"/><path className="map-car-arrow" d="M0 -19 14 15 0 9 -14 15Z"/></g></g>
   <text className="map-attribution" x="1178" y="683" textAnchor="end">Demo map · Ghent</text>
  </svg>
 </div>;
}
