'use babel';

export const exampleFile = `int dummy() {
      x = 10;

#ifdef DEC
      x = x - 1;
#else
      x = x + 1;
#endif

#ifdef MULT
#ifdef BIG
      x = x * 5;
#else
      x = x * 2;
#endif

#else
      x = x / 5;
#endif

      return x;


#ifdef DEC
new dimension
#endif

  }

1
2
3
4
#ifndef BIG
new dimension
#endif
6
7
8
`;

export const exampleTempFile = `int dummy() {
      x = 10;


      x = x - 1;

      x = x + 1;




      x = x * 5;

      x = x * 2;



      x = x / 5;


      return x;



new dimension


  }

1
2
3
4

new dimension

6
7
8
`;
