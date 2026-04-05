
/Users/spot/Code/DEViLBOX/third-party/uade-3.05/amigasrc/players/pretracker/pretracker.bin:     file format binary


Disassembly of section .data:

00000000 <.data>:
       0:	0000 0060      	orib #96,%d0
       4:	0000 007e      	orib #126,%d0
       8:	0000 009c      	orib #-100,%d0
       c:	0000 00ac      	orib #-84,%d0
      10:	0000 00be      	orib #-66,%d0
      14:	0000 00e0      	orib #-32,%d0
      18:	0000 00f0      	orib #-16,%d0
      1c:	0000 23d0      	orib #-48,%d0
      20:	0000 2866      	orib #102,%d0
      24:	0000 03c8      	orib #-56,%d0
      28:	0000 219e      	orib #-98,%d0
      2c:	0000 0308      	orib #8,%d0
      30:	0000 0102      	orib #2,%d0
      34:	0000 03bc      	orib #-68,%d0
      38:	2456           	moveal %fp@,%a2
      3a:	4552           	.short 0x4552
      3c:	3a20           	movew %a0@-,%d5
      3e:	5072 6554      	addqw #8,%a2@(0)@(0)
      42:	7261           	moveq #97,%d1
      44:	636b           	blss 0xb1
      46:	6572           	bcss 0xba
      48:	2031 2e35      	movel %a1@(35,%d2:l:8),%d0
      4c:	2028 6329      	movel %a0@(25385),%d0
      50:	2032 3032      	movel %a2@(32,%d3:w),%d0
      54:	3220           	movew %a0@-,%d1
      56:	4162           	.short 0x4162
      58:	7973           	.short 0x7973
      5a:	7321           	.short 0x7321
      5c:	004e           	.short 0x004e
      5e:	714e           	.short 0x714e
      60:	2f0b           	movel %a3,%sp@-
      62:	2f0a           	movel %a2,%sp@-
      64:	47fa ff9a      	lea %pc@(0x0),%a3
      68:	d7eb 001c      	addal %a3@(28),%a3
      6c:	2f0a           	movel %a2,%sp@-
      6e:	2f09           	movel %a1,%sp@-
      70:	2f08           	movel %a0,%sp@-
      72:	4e93           	jsr %a3@
      74:	4fef 000c      	lea %sp@(12),%sp
      78:	245f           	moveal %sp@+,%a2
      7a:	265f           	moveal %sp@+,%a3
      7c:	4e75           	rts
      7e:	2f0b           	movel %a3,%sp@-
      80:	2f0a           	movel %a2,%sp@-
      82:	47fa ff7c      	lea %pc@(0x0),%a3
      86:	d7eb 0020      	addal %a3@(32),%a3
      8a:	2f0a           	movel %a2,%sp@-
      8c:	2f09           	movel %a1,%sp@-
      8e:	2f08           	movel %a0,%sp@-
      90:	4e93           	jsr %a3@
      92:	4fef 000c      	lea %sp@(12),%sp
      96:	245f           	moveal %sp@+,%a2
      98:	265f           	moveal %sp@+,%a3
      9a:	4e75           	rts
      9c:	43fa ff62      	lea %pc@(0x0),%a1
      a0:	d3e9 0024      	addal %a1@(36),%a1
      a4:	2f08           	movel %a0,%sp@-
      a6:	4e91           	jsr %a1@
      a8:	588f           	addql #4,%sp
      aa:	4e75           	rts
      ac:	43fa ff52      	lea %pc@(0x0),%a1
      b0:	d3e9 0028      	addal %a1@(40),%a1
      b4:	2f00           	movel %d0,%sp@-
      b6:	2f08           	movel %a0,%sp@-
      b8:	4e91           	jsr %a1@
      ba:	508f           	addql #8,%sp
      bc:	4e75           	rts
      be:	2f03           	movel %d3,%sp@-
      c0:	2f02           	movel %d2,%sp@-
      c2:	43fa ff3c      	lea %pc@(0x0),%a1
      c6:	d3e9 002c      	addal %a1@(44),%a1
      ca:	2f03           	movel %d3,%sp@-
      cc:	2f02           	movel %d2,%sp@-
      ce:	2f01           	movel %d1,%sp@-
      d0:	2f00           	movel %d0,%sp@-
      d2:	2f08           	movel %a0,%sp@-
      d4:	4e91           	jsr %a1@
      d6:	4fef 0014      	lea %sp@(20),%sp
      da:	241f           	movel %sp@+,%d2
      dc:	261f           	movel %sp@+,%d3
      de:	4e75           	rts
      e0:	43fa ff1e      	lea %pc@(0x0),%a1
      e4:	d3e9 0030      	addal %a1@(48),%a1
      e8:	2f08           	movel %a0,%sp@-
      ea:	4e91           	jsr %a1@
      ec:	588f           	addql #4,%sp
      ee:	4e75           	rts
      f0:	43fa ff0e      	lea %pc@(0x0),%a1
      f4:	d3e9 0034      	addal %a1@(52),%a1
      f8:	2f00           	movel %d0,%sp@-
      fa:	2f08           	movel %a0,%sp@-
      fc:	4e91           	jsr %a1@
      fe:	508f           	addql #8,%sp
     100:	4e75           	rts
     102:	206f 0004      	moveal %sp@(4),%a0
     106:	4228 0a02      	clrb %a0@(2562)
     10a:	317c ffff 09fa 	movew #-1,%a0@(2554)
     110:	2028 0a64      	movel %a0@(2660),%d0
     114:	42a8 0036      	clrl %a0@(54)
     118:	317c 0001 0026 	movew #1,%a0@(38)
     11e:	317c ffff 0034 	movew #-1,%a0@(52)
     124:	4228 0006      	clrb %a0@(6)
     128:	4228 0078      	clrb %a0@(120)
     12c:	2140 006e      	movel %d0,%a0@(110)
     130:	317c 0002 0072 	movew #2,%a0@(114)
     136:	317c 007b 0076 	movew #123,%a0@(118)
     13c:	4290           	clrl %a0@
     13e:	42a8 005c      	clrl %a0@(92)
     142:	7203           	moveq #3,%d1
     144:	2141 0042      	movel %d1,%a0@(66)
     148:	42a8 02b4      	clrl %a0@(692)
     14c:	317c 0001 02a4 	movew #1,%a0@(676)
     152:	317c ffff 02b2 	movew #-1,%a0@(690)
     158:	4228 0284      	clrb %a0@(644)
     15c:	317c 0001 02f6 	movew #1,%a0@(758)
     162:	2140 02ec      	movel %d0,%a0@(748)
     166:	317c 0002 02f0 	movew #2,%a0@(752)
     16c:	317c 007b 02f4 	movew #123,%a0@(756)
     172:	42a8 027e      	clrl %a0@(638)
     176:	42a8 02da      	clrl %a0@(730)
     17a:	2141 02c0      	movel %d1,%a0@(704)
     17e:	42a8 0532      	clrl %a0@(1330)
     182:	317c 0001 0522 	movew #1,%a0@(1314)
     188:	317c ffff 0530 	movew #-1,%a0@(1328)
     18e:	4228 0502      	clrb %a0@(1282)
     192:	317c 0001 0574 	movew #1,%a0@(1396)
     198:	2140 056a      	movel %d0,%a0@(1386)
     19c:	317c 0002 056e 	movew #2,%a0@(1390)
     1a2:	317c 007b 0572 	movew #123,%a0@(1394)
     1a8:	42a8 04fc      	clrl %a0@(1276)
     1ac:	42a8 0558      	clrl %a0@(1368)
     1b0:	2141 053e      	movel %d1,%a0@(1342)
     1b4:	42a8 07b0      	clrl %a0@(1968)
     1b8:	317c 0001 07a0 	movew #1,%a0@(1952)
     1be:	317c ffff 07ae 	movew #-1,%a0@(1966)
     1c4:	4228 0780      	clrb %a0@(1920)
     1c8:	317c 0001 07f2 	movew #1,%a0@(2034)
     1ce:	2140 07e8      	movel %d0,%a0@(2024)
     1d2:	317c 0002 07ec 	movew #2,%a0@(2028)
     1d8:	317c 007b 07f0 	movew #123,%a0@(2032)
     1de:	42a8 077a      	clrl %a0@(1914)
     1e2:	42a8 07d6      	clrl %a0@(2006)
     1e6:	2141 07bc      	movel %d1,%a0@(1980)
     1ea:	33fc 0001 00df 	movew #1,0xdff096
     1f0:	f096 
     1f2:	23e8 006e 00df 	movel %a0@(110),0xdff0a0
     1f8:	f0a0 
     1fa:	3028 0072      	movew %a0@(114),%d0
     1fe:	e248           	lsrw #1,%d0
     200:	33c0 00df f0a4 	movew %d0,0xdff0a4
     206:	33fc 0000 00df 	movew #0,0xdff0a8
     20c:	f0a8 
     20e:	4228 0079      	clrb %a0@(121)
     212:	33fc 0071 00df 	movew #113,0xdff0a6
     218:	f0a6 
     21a:	4a28 02f7      	tstb %a0@(759)
     21e:	6600 00b4      	bnew 0x2d4
     222:	4240           	clrw %d0
     224:	1028 02f6      	moveb %a0@(758),%d0
     228:	33c0 00df f0b8 	movew %d0,0xdff0b8
     22e:	33e8 02f4 00df 	movew %a0@(756),0xdff0b6
     234:	f0b6 
     236:	4a28 0575      	tstb %a0@(1397)
     23a:	6664           	bnes 0x2a0
     23c:	4240           	clrw %d0
     23e:	1028 0574      	moveb %a0@(1396),%d0
     242:	33c0 00df f0c8 	movew %d0,0xdff0c8
     248:	33e8 0572 00df 	movew %a0@(1394),0xdff0c6
     24e:	f0c6 
     250:	4a28 07f3      	tstb %a0@(2035)
     254:	6732           	beqs 0x288
     256:	33fc 0008 00df 	movew #8,0xdff096
     25c:	f096 
     25e:	23e8 07e8 00df 	movel %a0@(2024),0xdff0d0
     264:	f0d0 
     266:	3028 07ec      	movew %a0@(2028),%d0
     26a:	e248           	lsrw #1,%d0
     26c:	33c0 00df f0d4 	movew %d0,0xdff0d4
     272:	33fc 0000 00df 	movew #0,0xdff0d8
     278:	f0d8 
     27a:	4228 07f3      	clrb %a0@(2035)
     27e:	33fc 0071 00df 	movew #113,0xdff0d6
     284:	f0d6 
     286:	4e75           	rts
     288:	4240           	clrw %d0
     28a:	1028 07f2      	moveb %a0@(2034),%d0
     28e:	33c0 00df f0d8 	movew %d0,0xdff0d8
     294:	3028 07f0      	movew %a0@(2032),%d0
     298:	33c0 00df f0d6 	movew %d0,0xdff0d6
     29e:	4e75           	rts
     2a0:	33fc 0004 00df 	movew #4,0xdff096
     2a6:	f096 
     2a8:	23e8 056a 00df 	movel %a0@(1386),0xdff0c0
     2ae:	f0c0 
     2b0:	3028 056e      	movew %a0@(1390),%d0
     2b4:	e248           	lsrw #1,%d0
     2b6:	33c0 00df f0c4 	movew %d0,0xdff0c4
     2bc:	33fc 0000 00df 	movew #0,0xdff0c8
     2c2:	f0c8 
     2c4:	4228 0575      	clrb %a0@(1397)
     2c8:	33fc 0071 00df 	movew #113,0xdff0c6
     2ce:	f0c6 
     2d0:	6000 ff7e      	braw 0x250
     2d4:	33fc 0002 00df 	movew #2,0xdff096
     2da:	f096 
     2dc:	23e8 02ec 00df 	movel %a0@(748),0xdff0b0
     2e2:	f0b0 
     2e4:	3028 02f0      	movew %a0@(752),%d0
     2e8:	e248           	lsrw #1,%d0
     2ea:	33c0 00df f0b4 	movew %d0,0xdff0b4
     2f0:	33fc 0000 00df 	movew #0,0xdff0b8
     2f6:	f0b8 
     2f8:	4228 02f7      	clrb %a0@(759)
     2fc:	33fc 0071 00df 	movew #113,0xdff0b6
     302:	f0b6 
     304:	6000 ff30      	braw 0x236
     308:	2f0a           	movel %a2,%sp@-
     30a:	226f 0008      	moveal %sp@(8),%a1
     30e:	222f 000c      	movel %sp@(12),%d1
     312:	2001           	movel %d1,%d0
     314:	d081           	addl %d1,%d0
     316:	d080           	addl %d0,%d0
     318:	d081           	addl %d1,%d0
     31a:	ed88           	lsll #6,%d0
     31c:	9081           	subl %d1,%d0
     31e:	d080           	addl %d0,%d0
     320:	41f1 0800      	lea %a1@(0,%d0:l),%a0
     324:	2469 09fe      	moveal %a1@(2558),%a2
     328:	122f 0013      	moveb %sp@(19),%d1
     32c:	0601 0020      	addib #32,%d1
     330:	4268 0014      	clrw %a0@(20)
     334:	4268 0012      	clrw %a0@(18)
     338:	4228 000d      	clrb %a0@(13)
     33c:	4228 0009      	clrb %a0@(9)
     340:	4271 080a      	clrw %a1@(a,%d0:l)
     344:	50e8 0017      	st %a0@(23)
     348:	317c 0040 0020 	movew #64,%a0@(32)
     34e:	317c 0040 001a 	movew #64,%a0@(26)
     354:	317c 00ff 001e 	movew #255,%a0@(30)
     35a:	4268 0022      	clrw %a0@(34)
     35e:	317c ffff 0024 	movew #-1,%a0@(36)
     364:	4228 0028      	clrb %a0@(40)
     368:	4268 002a      	clrw %a0@(42)
     36c:	4268 002e      	clrw %a0@(46)
     370:	4268 0030      	clrw %a0@(48)
     374:	4268 0032      	clrw %a0@(50)
     378:	317c 0010 002c 	movew #16,%a0@(44)
     37e:	4228 006a      	clrb %a0@(106)
     382:	4228 006c      	clrb %a0@(108)
     386:	117c 0001 006b 	moveb #1,%a0@(107)
     38c:	7000           	moveq #0,%d0
     38e:	1001           	moveb %d1,%d0
     390:	0680 1fff ffff 	addil #536870911,%d0
     396:	e788           	lsll #3,%d0
     398:	d0aa 011c      	addl %a2@(284),%d0
     39c:	2140 003a      	movel %d0,%a0@(58)
     3a0:	4240           	clrw %d0
     3a2:	1001           	moveb %d1,%d0
     3a4:	3140 001c      	movew %d0,%a0@(28)
     3a8:	1141 000c      	moveb %d1,%a0@(12)
     3ac:	116f 0017 000e 	moveb %sp@(23),%a0@(14)
     3b2:	116f 001b 0006 	moveb %sp@(27),%a0@(6)
     3b8:	245f           	moveal %sp@+,%a2
     3ba:	4e75           	rts
     3bc:	206f 0004      	moveal %sp@(4),%a0
     3c0:	116f 000b 09f9 	moveb %sp@(11),%a0@(2553)
     3c6:	4e75           	rts
     3c8:	4fef ffd8      	lea %sp@(-40),%sp
     3cc:	48e7 3f36      	moveml %d2-%d7/%a2-%a3/%a5-%fp,%sp@-
     3d0:	266f 0054      	moveal %sp@(84),%a3
     3d4:	204b           	moveal %a3,%a0
     3d6:	4a2b 0a02      	tstb %a3@(2562)
     3da:	6600 118a      	bnew 0x1566
     3de:	42af 002c      	clrl %sp@(44)
     3e2:	43fa 40fc      	lea %pc@(0x44e0),%a1
     3e6:	2f49 0034      	movel %a1,%sp@(52)
     3ea:	702a           	moveq #42,%d0
     3ec:	c0fc 0000      	muluw #0,%d0
     3f0:	2f40 003c      	movel %d0,%sp@(60)
     3f4:	4dfa 456e      	lea %pc@(0x4964),%fp
     3f8:	4bfa 074c      	lea %pc@(0xb46),%a5
     3fc:	43fa 3e9a      	lea %pc@(0x4298),%a1
     400:	2f49 0040      	movel %a1,%sp@(64)
     404:	2268 003a      	moveal %a0@(58),%a1
     408:	3028 002c      	movew %a0@(44),%d0
     40c:	b2fc 0000      	cmpaw #0,%a1
     410:	6756           	beqs 0x468
     412:	d068 0032      	addw %a0@(50),%d0
     416:	d068 0014      	addw %a0@(20),%d0
     41a:	0c40 0240      	cmpiw #576,%d0
     41e:	6e00 0640      	bgtw 0xa60
     422:	3140 002c      	movew %d0,%a0@(44)
     426:	3028 001a      	movew %a0@(26),%d0
     42a:	d068 002a      	addw %a0@(42),%d0
     42e:	6b00 0642      	bmiw 0xa72
     432:	0c40 0040      	cmpiw #64,%d0
     436:	6f00 0f90      	blew 0x13c8
     43a:	317c 0040 001a 	movew #64,%a0@(26)
     440:	1228 006c      	moveb %a0@(108),%d1
     444:	6700 0638      	beqw 0xa7e
     448:	3f68 001e 0030 	movew %a0@(30),%sp@(48)
     44e:	0c6f 00ff 0030 	cmpiw #255,%sp@(48)
     454:	6700 04b0      	beqw 0x906
     458:	0c01 ffff      	cmpib #-1,%d1
     45c:	6706           	beqs 0x464
     45e:	5301           	subqb #1,%d1
     460:	1141 006c      	moveb %d1,%a0@(108)
     464:	3028 002c      	movew %a0@(44),%d0
     468:	1228 000c      	moveb %a0@(12),%d1
     46c:	3428 001a      	movew %a0@(26),%d2
     470:	4a01           	tstb %d1
     472:	6600 0a70      	bnew 0xee4
     476:	2268 0042      	moveal %a0@(66),%a1
     47a:	2228 005c      	movel %a0@(92),%d1
     47e:	7a03           	moveq #3,%d5
     480:	ba89           	cmpl %a1,%d5
     482:	6700 0b2e      	beqw 0xfb2
     486:	6500 0a50      	bcsw 0xed8
     48a:	b2fc 0000      	cmpaw #0,%a1
     48e:	6700 1a9e      	beqw 0x1f2e
     492:	7c01           	moveq #1,%d6
     494:	bc89           	cmpl %a1,%d6
     496:	6600 0a40      	bnew 0xed8
     49a:	1628 0046      	moveb %a0@(70),%d3
     49e:	0c03 ff8e      	cmpib #-114,%d3
     4a2:	6200 0bae      	bhiw 0x1052
     4a6:	1803           	moveb %d3,%d4
     4a8:	5204           	addqb #1,%d4
     4aa:	0283 0000 00ff 	andil #255,%d3
     4b0:	d683           	addl %d3,%d3
     4b2:	43fa 3f0c      	lea %pc@(0x43c0),%a1
     4b6:	7a00           	moveq #0,%d5
     4b8:	3a31 3800      	movew %a1@(0,%d3:l),%d5
     4bc:	1144 0046      	moveb %d4,%a0@(70)
     4c0:	2601           	movel %d1,%d3
     4c2:	9685           	subl %d5,%d3
     4c4:	2143 005c      	movel %d3,%a0@(92)
     4c8:	2228 0054      	movel %a0@(84),%d1
     4cc:	ed89           	lsll #6,%d1
     4ce:	3241           	moveaw %d1,%a1
     4d0:	b3c3           	cmpal %d3,%a1
     4d2:	6c00 0b9c      	bgew 0x1070
     4d6:	e84b           	lsrw #4,%d3
     4d8:	7200           	moveq #0,%d1
     4da:	3203           	movew %d3,%d1
     4dc:	1628 000f      	moveb %a0@(15),%d3
     4e0:	6712           	beqs 0x4f4
     4e2:	5303           	subqb #1,%d3
     4e4:	1143 000f      	moveb %d3,%a0@(15)
     4e8:	660a           	bnes 0x4f4
     4ea:	42a8 005c      	clrl %a0@(92)
     4ee:	7a03           	moveq #3,%d5
     4f0:	2145 0042      	movel %d5,%a0@(66)
     4f4:	c2c2           	muluw %d2,%d1
     4f6:	1428 0006      	moveb %a0@(6),%d2
     4fa:	4882           	extw %d2
     4fc:	ec89           	lsrl #6,%d1
     4fe:	0281 0000 ffff 	andil #65535,%d1
     504:	c2c2           	muluw %d2,%d1
     506:	ec89           	lsrl #6,%d1
     508:	3601           	movew %d1,%d3
     50a:	142b 09f9      	moveb %a3@(2553),%d2
     50e:	0c02 0040      	cmpib #64,%d2
     512:	6716           	beqs 0x52a
     514:	4a28 000e      	tstb %a0@(14)
     518:	6610           	bnes 0x52a
     51a:	0242 00ff      	andiw #255,%d2
     51e:	0281 0000 ffff 	andil #65535,%d1
     524:	c2c2           	muluw %d2,%d1
     526:	ec89           	lsrl #6,%d1
     528:	3601           	movew %d1,%d3
     52a:	1143 0078      	moveb %d3,%a0@(120)
     52e:	2268 003e      	moveal %a0@(62),%a1
     532:	7200           	moveq #0,%d1
     534:	1229 0004      	moveb %a1@(4),%d1
     538:	e189           	lsll #8,%d1
     53a:	8229 0005      	orb %a1@(5),%d1
     53e:	3801           	movew %d1,%d4
     540:	1428 000d      	moveb %a0@(13),%d2
     544:	4a41           	tstw %d1
     546:	6700 04b4      	beqw 0x9fc
     54a:	4a02           	tstb %d2
     54c:	6700 094e      	beqw 0xe9c
     550:	4a29 0006      	tstb %a1@(6)
     554:	6700 0946      	beqw 0xe9c
     558:	0282 0000 00ff 	andil #255,%d2
     55e:	ef8a           	lsll #7,%d2
     560:	4228 000d      	clrb %a0@(13)
     564:	7600           	moveq #0,%d3
     566:	1629 0008      	moveb %a1@(8),%d3
     56a:	e18b           	lsll #8,%d3
     56c:	8629 0009      	orb %a1@(9),%d3
     570:	4a68 0026      	tstw %a0@(38)
     574:	6f00 0e90      	blew 0x1406
     578:	9483           	subl %d3,%d2
     57a:	4245           	clrw %d5
     57c:	1a29 0007      	moveb %a1@(7),%d5
     580:	3145 0034      	movew %d5,%a0@(52)
     584:	d483           	addl %d3,%d2
     586:	2c01           	movel %d1,%d6
     588:	dc82           	addl %d2,%d6
     58a:	7600           	moveq #0,%d3
     58c:	1629 0002      	moveb %a1@(2),%d3
     590:	e18b           	lsll #8,%d3
     592:	8629 0003      	orb %a1@(3),%d3
     596:	b682           	cmpl %d2,%d3
     598:	6c0c           	bges 0x5a6
     59a:	7600           	moveq #0,%d3
     59c:	1629 000a      	moveb %a1@(10),%d3
     5a0:	e18b           	lsll #8,%d3
     5a2:	8629 000b      	orb %a1@(11),%d3
     5a6:	9686           	subl %d6,%d3
     5a8:	4a83           	tstl %d3
     5aa:	6f00 0eac      	blew 0x1458
     5ae:	2142 0036      	movel %d2,%a0@(54)
     5b2:	3141 0072      	movew %d1,%a0@(114)
     5b6:	3142 0074      	movew %d2,%a0@(116)
     5ba:	7200           	moveq #0,%d1
     5bc:	3228 001e      	movew %a0@(30),%d1
     5c0:	0681 0000 0281 	addil #641,%d1
     5c6:	d281           	addl %d1,%d1
     5c8:	d281           	addl %d1,%d1
     5ca:	2173 1800 006e 	movel %a3@(0,%d1:l),%a0@(110)
     5d0:	1a28 0079      	moveb %a0@(121),%d5
     5d4:	4a28 0028      	tstb %a0@(40)
     5d8:	6600 0418      	bnew 0x9f2
     5dc:	d068 002e      	addw %a0@(46),%d0
     5e0:	3228 0022      	movew %a0@(34),%d1
     5e4:	e949           	lslw #4,%d1
     5e6:	d240           	addw %d0,%d1
     5e8:	3028 0030      	movew %a0@(48),%d0
     5ec:	0640 ffe0      	addiw #-32,%d0
     5f0:	d041           	addw %d1,%d0
     5f2:	3228 0068      	movew %a0@(104),%d1
     5f6:	6600 03da      	bnew 0x9d2
     5fa:	3c28 0064      	movew %a0@(100),%d6
     5fe:	3228 0066      	movew %a0@(102),%d1
     602:	3401           	movew %d1,%d2
     604:	d468 0062      	addw %a0@(98),%d2
     608:	3142 0062      	movew %d2,%a0@(98)
     60c:	3442           	moveaw %d2,%a2
     60e:	7600           	moveq #0,%d3
     610:	3606           	movew %d6,%d3
     612:	b68a           	cmpl %a2,%d3
     614:	6c0e           	bges 0x624
     616:	4441           	negw %d1
     618:	3141 0066      	movew %d1,%a0@(102)
     61c:	3406           	movew %d6,%d2
     61e:	3146 0062      	movew %d6,%a0@(98)
     622:	3446           	moveaw %d6,%a2
     624:	4483           	negl %d3
     626:	b5c3           	cmpal %d3,%a2
     628:	6c0e           	bges 0x638
     62a:	4441           	negw %d1
     62c:	3141 0066      	movew %d1,%a0@(102)
     630:	3406           	movew %d6,%d2
     632:	4442           	negw %d2
     634:	3142 0062      	movew %d2,%a0@(98)
     638:	e642           	asrw #3,%d2
     63a:	d042           	addw %d2,%d0
     63c:	0c40 0219      	cmpiw #537,%d0
     640:	6f00 0382      	blew 0x9c4
     644:	347c 0231      	moveaw #561,%a2
     648:	0829 0002 0014 	btst #2,%a1@(20)
     64e:	6700 0082      	beqw 0x6d2
     652:	7400           	moveq #0,%d2
     654:	1429 000a      	moveb %a1@(10),%d2
     658:	e18a           	lsll #8,%d2
     65a:	8429 000b      	orb %a1@(11),%d2
     65e:	3602           	movew %d2,%d3
     660:	3200           	movew %d0,%d1
     662:	0641 fde7      	addiw #-537,%d1
     666:	e889           	lsrl #4,%d1
     668:	7c00           	moveq #0,%d6
     66a:	4606           	notb %d6
     66c:	cc81           	andl %d1,%d6
     66e:	2246           	moveal %d6,%a1
     670:	45fa 3cc2      	lea %pc@(0x4334),%a2
     674:	1232 6800      	moveb %a2@(0,%d6:l),%d1
     678:	3c28 0074      	movew %a0@(116),%d6
     67c:	0c46 ffff      	cmpiw #-1,%d6
     680:	6700 0c4e      	beqw 0x12d0
     684:	7400           	moveq #0,%d2
     686:	1401           	moveb %d1,%d2
     688:	0286 0000 ffff 	andil #65535,%d6
     68e:	e4a6           	asrl %d2,%d6
     690:	3146 0074      	movew %d6,%a0@(116)
     694:	7c00           	moveq #0,%d6
     696:	3c04           	movew %d4,%d6
     698:	e4a6           	asrl %d2,%d6
     69a:	3806           	movew %d6,%d4
     69c:	3146 0072      	movew %d6,%a0@(114)
     6a0:	4a01           	tstb %d1
     6a2:	6714           	beqs 0x6b8
     6a4:	2428 006e      	movel %a0@(110),%d2
     6a8:	7c00           	moveq #0,%d6
     6aa:	3c03           	movew %d3,%d6
     6ac:	d486           	addl %d6,%d2
     6ae:	e24b           	lsrw #1,%d3
     6b0:	5301           	subqb #1,%d1
     6b2:	66f4           	bnes 0x6a8
     6b4:	2142 006e      	movel %d2,%a0@(110)
     6b8:	45fa 3c0e      	lea %pc@(0x42c8),%a2
     6bc:	4241           	clrw %d1
     6be:	1232 9800      	moveb %a2@(0,%a1:l),%d1
     6c2:	e949           	lslw #4,%d1
     6c4:	9041           	subw %d1,%d0
     6c6:	0c40 0231      	cmpiw #561,%d0
     6ca:	6f04           	bles 0x6d0
     6cc:	303c 0231      	movew #561,%d0
     6d0:	3440           	moveaw %d0,%a2
     6d2:	4a05           	tstb %d5
     6d4:	6718           	beqs 0x6ee
     6d6:	3028 0074      	movew %a0@(116),%d0
     6da:	0c40 ffff      	cmpiw #-1,%d0
     6de:	670e           	beqs 0x6ee
     6e0:	0280 0000 ffff 	andil #65535,%d0
     6e6:	d1a8 006e      	addl %d0,%a0@(110)
     6ea:	4268 0074      	clrw %a0@(116)
     6ee:	b868 0004      	cmpw %a0@(4),%d4
     6f2:	670a           	beqs 0x6fe
     6f4:	117c 0001 0079 	moveb #1,%a0@(121)
     6fa:	3144 0004      	movew %d4,%a0@(4)
     6fe:	d5ca           	addal %a2,%a2
     700:	226f 0034      	moveal %sp@(52),%a1
     704:	3171 a800 0076 	movew %a1@(0,%a2:l),%a0@(118)
     70a:	1028 0016      	moveb %a0@(22),%d0
     70e:	6600 0278      	bnew 0x988
     712:	52af 002c      	addql #1,%sp@(44)
     716:	41e8 027e      	lea %a0@(638),%a0
     71a:	7604           	moveq #4,%d3
     71c:	b6af 002c      	cmpl %sp@(44),%d3
     720:	6600 fce2      	bnew 0x404
     724:	4a2b 0079      	tstb %a3@(121)
     728:	6600 0b72      	bnew 0x129c
     72c:	4240           	clrw %d0
     72e:	102b 0078      	moveb %a3@(120),%d0
     732:	33c0 00df f0a8 	movew %d0,0xdff0a8
     738:	33eb 0076 00df 	movew %a3@(118),0xdff0a6
     73e:	f0a6 
     740:	4a2b 02f7      	tstb %a3@(759)
     744:	6600 0b22      	bnew 0x1268
     748:	4240           	clrw %d0
     74a:	102b 02f6      	moveb %a3@(758),%d0
     74e:	33c0 00df f0b8 	movew %d0,0xdff0b8
     754:	33eb 02f4 00df 	movew %a3@(756),0xdff0b6
     75a:	f0b6 
     75c:	4a2b 0575      	tstb %a3@(1397)
     760:	6600 0ad2      	bnew 0x1234
     764:	4240           	clrw %d0
     766:	102b 0574      	moveb %a3@(1396),%d0
     76a:	33c0 00df f0c8 	movew %d0,0xdff0c8
     770:	33eb 0572 00df 	movew %a3@(1394),0xdff0c6
     776:	f0c6 
     778:	4a2b 07f3      	tstb %a3@(2035)
     77c:	6700 0a96      	beqw 0x1214
     780:	33fc 0008 00df 	movew #8,0xdff096
     786:	f096 
     788:	23eb 07e8 00df 	movel %a3@(2024),0xdff0d0
     78e:	f0d0 
     790:	302b 07ec      	movew %a3@(2028),%d0
     794:	e248           	lsrw #1,%d0
     796:	33c0 00df f0d4 	movew %d0,0xdff0d4
     79c:	33fc 0000 00df 	movew #0,0xdff0d8
     7a2:	f0d8 
     7a4:	422b 07f3      	clrb %a3@(2035)
     7a8:	33fc 0071 00df 	movew #113,0xdff0d6
     7ae:	f0d6 
     7b0:	7404           	moveq #4,%d2
     7b2:	223c 00ff ffff 	movel #16777215,%d1
     7b8:	2039 00df f004 	movel 0xdff004,%d0
     7be:	2f40 0048      	movel %d0,%sp@(72)
     7c2:	202f 0048      	movel %sp@(72),%d0
     7c6:	e088           	lsrl #8,%d0
     7c8:	0280 0000 01ff 	andil #511,%d0
     7ce:	2f40 0048      	movel %d0,%sp@(72)
     7d2:	202f 0048      	movel %sp@(72),%d0
     7d6:	b280           	cmpl %d0,%d1
     7d8:	67de           	beqs 0x7b8
     7da:	222f 0048      	movel %sp@(72),%d1
     7de:	5302           	subqb #1,%d2
     7e0:	66d6           	bnes 0x7b8
     7e2:	33fc 800f 00df 	movew #-32753,0xdff096
     7e8:	f096 
     7ea:	7404           	moveq #4,%d2
     7ec:	223c 00ff ffff 	movel #16777215,%d1
     7f2:	2039 00df f004 	movel 0xdff004,%d0
     7f8:	2f40 004c      	movel %d0,%sp@(76)
     7fc:	202f 004c      	movel %sp@(76),%d0
     800:	e088           	lsrl #8,%d0
     802:	0280 0000 01ff 	andil #511,%d0
     808:	2f40 004c      	movel %d0,%sp@(76)
     80c:	202f 004c      	movel %sp@(76),%d0
     810:	b280           	cmpl %d0,%d1
     812:	67de           	beqs 0x7f2
     814:	222f 004c      	movel %sp@(76),%d1
     818:	5302           	subqb #1,%d2
     81a:	66d6           	bnes 0x7f2
     81c:	33fc 8001 00df 	movew #-32767,0xdff096
     822:	f096 
     824:	302b 0074      	movew %a3@(116),%d0
     828:	0c40 ffff      	cmpiw #-1,%d0
     82c:	6700 1300      	beqw 0x1b2e
     830:	0280 0000 ffff 	andil #65535,%d0
     836:	d0ab 006e      	addl %a3@(110),%d0
     83a:	23c0 00df f0a0 	movel %d0,0xdff0a0
     840:	33eb 0076 00df 	movew %a3@(118),0xdff0a6
     846:	f0a6 
     848:	4240           	clrw %d0
     84a:	102b 0078      	moveb %a3@(120),%d0
     84e:	33c0 00df f0a8 	movew %d0,0xdff0a8
     854:	33fc 8002 00df 	movew #-32766,0xdff096
     85a:	f096 
     85c:	302b 02f2      	movew %a3@(754),%d0
     860:	0c40 ffff      	cmpiw #-1,%d0
     864:	6700 1300      	beqw 0x1b66
     868:	0280 0000 ffff 	andil #65535,%d0
     86e:	d0ab 02ec      	addl %a3@(748),%d0
     872:	23c0 00df f0b0 	movel %d0,0xdff0b0
     878:	33eb 02f4 00df 	movew %a3@(756),0xdff0b6
     87e:	f0b6 
     880:	4240           	clrw %d0
     882:	102b 02f6      	moveb %a3@(758),%d0
     886:	33c0 00df f0b8 	movew %d0,0xdff0b8
     88c:	33fc 8004 00df 	movew #-32764,0xdff096
     892:	f096 
     894:	302b 0570      	movew %a3@(1392),%d0
     898:	0c40 ffff      	cmpiw #-1,%d0
     89c:	6700 1300      	beqw 0x1b9e
     8a0:	0280 0000 ffff 	andil #65535,%d0
     8a6:	d0ab 056a      	addl %a3@(1386),%d0
     8aa:	23c0 00df f0c0 	movel %d0,0xdff0c0
     8b0:	33eb 0572 00df 	movew %a3@(1394),0xdff0c6
     8b6:	f0c6 
     8b8:	4240           	clrw %d0
     8ba:	102b 0574      	moveb %a3@(1396),%d0
     8be:	33c0 00df f0c8 	movew %d0,0xdff0c8
     8c4:	33fc 8008 00df 	movew #-32760,0xdff096
     8ca:	f096 
     8cc:	302b 07ee      	movew %a3@(2030),%d0
     8d0:	0c40 ffff      	cmpiw #-1,%d0
     8d4:	6700 122a      	beqw 0x1b00
     8d8:	0280 0000 ffff 	andil #65535,%d0
     8de:	d0ab 07e8      	addl %a3@(2024),%d0
     8e2:	23c0 00df f0d0 	movel %d0,0xdff0d0
     8e8:	33eb 07f0 00df 	movew %a3@(2032),0xdff0d6
     8ee:	f0d6 
     8f0:	4240           	clrw %d0
     8f2:	102b 07f2      	moveb %a3@(2034),%d0
     8f6:	33c0 00df f0d8 	movew %d0,0xdff0d8
     8fc:	4cdf 6cfc      	moveml %sp@+,%d2-%d7/%a2-%a3/%a5-%fp
     900:	4fef 0028      	lea %sp@(40),%sp
     904:	4e75           	rts
     906:	4268 001e      	clrw %a0@(30)
     90a:	226b 09fe      	moveal %a3@(2558),%a1
     90e:	2269 0120      	moveal %a1@(288),%a1
     912:	d3ef 003c      	addal %sp@(60),%a1
     916:	2149 003e      	movel %a1,%a0@(62)
     91a:	7000           	moveq #0,%d0
     91c:	1029 0004      	moveb %a1@(4),%d0
     920:	e188           	lsll #8,%d0
     922:	8029 0005      	orb %a1@(5),%d0
     926:	4a80           	tstl %d0
     928:	6600 09f0      	bnew 0x131a
     92c:	7000           	moveq #0,%d0
     92e:	1029 000c      	moveb %a1@(12),%d0
     932:	e188           	lsll #8,%d0
     934:	8029 000d      	orb %a1@(13),%d0
     938:	7600           	moveq #0,%d3
     93a:	3600           	movew %d0,%d3
     93c:	117c 0001 0079 	moveb #1,%a0@(121)
     942:	282b 0a04      	movel %a3@(2564),%d4
     946:	d880           	addl %d0,%d4
     948:	2144 006e      	movel %d4,%a0@(110)
     94c:	7400           	moveq #0,%d2
     94e:	1429 000a      	moveb %a1@(10),%d2
     952:	e18a           	lsll #8,%d2
     954:	8429 000b      	orb %a1@(11),%d2
     958:	2802           	movel %d2,%d4
     95a:	5384           	subql #1,%d4
     95c:	b880           	cmpl %d0,%d4
     95e:	6f00 0b20      	blew 0x1480
     962:	9440           	subw %d0,%d2
     964:	3142 0072      	movew %d2,%a0@(114)
     968:	317c ffff 0074 	movew #-1,%a0@(116)
     96e:	4240           	clrw %d0
     970:	1029 0007      	moveb %a1@(7),%d0
     974:	5240           	addqw #1,%d0
     976:	3140 0034      	movew %d0,%a0@(52)
     97a:	2143 0036      	movel %d3,%a0@(54)
     97e:	317c 0001 0026 	movew #1,%a0@(38)
     984:	6000 fad2      	braw 0x458
     988:	7203           	moveq #3,%d1
     98a:	b2af 002c      	cmpl %sp@(44),%d1
     98e:	6700 fd94      	beqw 0x724
     992:	226f 002c      	moveal %sp@(44),%a1
     996:	5289           	addql #1,%a1
     998:	2209           	movel %a1,%d1
     99a:	d289           	addl %a1,%d1
     99c:	d281           	addl %d1,%d1
     99e:	d289           	addl %a1,%d1
     9a0:	ed89           	lsll #6,%d1
     9a2:	9289           	subl %a1,%d1
     9a4:	d281           	addl %d1,%d1
     9a6:	4a33 180e      	tstb %a3@(e,%d1:l)
     9aa:	6700 0798      	beqw 0x1144
     9ae:	2f49 002c      	movel %a1,%sp@(44)
     9b2:	41e8 027e      	lea %a0@(638),%a0
     9b6:	7604           	moveq #4,%d3
     9b8:	b6af 002c      	cmpl %sp@(44),%d3
     9bc:	6600 fa46      	bnew 0x404
     9c0:	6000 fd62      	braw 0x724
     9c4:	4a40           	tstw %d0
     9c6:	6c00 fd08      	bgew 0x6d0
     9ca:	4240           	clrw %d0
     9cc:	3440           	moveaw %d0,%a2
     9ce:	6000 fd02      	braw 0x6d2
     9d2:	5341           	subqw #1,%d1
     9d4:	3141 0068      	movew %d1,%a0@(104)
     9d8:	6600 fc62      	bnew 0x63c
     9dc:	3c28 0064      	movew %a0@(100),%d6
     9e0:	3228 0066      	movew %a0@(102),%d1
     9e4:	48c1           	extl %d1
     9e6:	c3c6           	mulsw %d6,%d1
     9e8:	e841           	asrw #4,%d1
     9ea:	3141 0066      	movew %d1,%a0@(102)
     9ee:	6000 fc12      	braw 0x602
     9f2:	3200           	movew %d0,%d1
     9f4:	0641 0010      	addiw #16,%d1
     9f8:	6000 fbee      	braw 0x5e8
     9fc:	4a02           	tstb %d2
     9fe:	6700 0490      	beqw 0xe90
     a02:	4a29 0006      	tstb %a1@(6)
     a06:	6700 0488      	beqw 0xe90
     a0a:	7200           	moveq #0,%d1
     a0c:	3228 001e      	movew %a0@(30),%d1
     a10:	0242 00ff      	andiw #255,%d2
     a14:	ef4a           	lslw #7,%d2
     a16:	117c 0001 0079 	moveb #1,%a0@(121)
     a1c:	0681 0000 0281 	addil #641,%d1
     a22:	d281           	addl %d1,%d1
     a24:	d281           	addl %d1,%d1
     a26:	7600           	moveq #0,%d3
     a28:	3602           	movew %d2,%d3
     a2a:	2233 1800      	movel %a3@(0,%d1:l),%d1
     a2e:	d283           	addl %d3,%d1
     a30:	2141 006e      	movel %d1,%a0@(110)
     a34:	7800           	moveq #0,%d4
     a36:	1829 000a      	moveb %a1@(10),%d4
     a3a:	e18c           	lsll #8,%d4
     a3c:	8829 000b      	orb %a1@(11),%d4
     a40:	2204           	movel %d4,%d1
     a42:	5381           	subql #1,%d1
     a44:	b283           	cmpl %d3,%d1
     a46:	6f00 09a8      	blew 0x13f0
     a4a:	9842           	subw %d2,%d4
     a4c:	3144 0072      	movew %d4,%a0@(114)
     a50:	317c ffff 0074 	movew #-1,%a0@(116)
     a56:	4228 000d      	clrb %a0@(13)
     a5a:	7a01           	moveq #1,%d5
     a5c:	6000 fb76      	braw 0x5d4
     a60:	317c 0240 002c 	movew #576,%a0@(44)
     a66:	3028 001a      	movew %a0@(26),%d0
     a6a:	d068 002a      	addw %a0@(42),%d0
     a6e:	6a00 f9c2      	bplw 0x432
     a72:	4268 001a      	clrw %a0@(26)
     a76:	1228 006c      	moveb %a0@(108),%d1
     a7a:	6600 f9cc      	bnew 0x448
     a7e:	4268 0032      	clrw %a0@(50)
     a82:	4268 002a      	clrw %a0@(42)
     a86:	3228 0024      	movew %a0@(36),%d1
     a8a:	6b00 0580      	bmiw 0x100c
     a8e:	0c41 0020      	cmpiw #32,%d1
     a92:	6f02           	bles 0xa96
     a94:	7220           	moveq #32,%d1
     a96:	1001           	moveb %d1,%d0
     a98:	1141 006a      	moveb %d1,%a0@(106)
     a9c:	317c ffff 0024 	movew #-1,%a0@(36)
     aa2:	1200           	moveb %d0,%d1
     aa4:	4881           	extw %d1
     aa6:	3441           	moveaw %d1,%a2
     aa8:	7800           	moveq #0,%d4
     aaa:	1829 0007      	moveb %a1@(7),%d4
     aae:	3f68 001e 0030 	movew %a0@(30),%sp@(48)
     ab4:	b5c4           	cmpal %d4,%a2
     ab6:	6c00 01c4      	bgew 0xc7c
     aba:	2f6b 09fe 0038 	movel %a3@(2558),%sp@(56)
     ac0:	1228 001d      	moveb %a0@(29),%d1
     ac4:	5301           	subqb #1,%d1
     ac6:	0281 0000 00ff 	andil #255,%d1
     acc:	d281           	addl %d1,%d1
     ace:	d281           	addl %d1,%d1
     ad0:	226f 0038      	moveal %sp@(56),%a1
     ad4:	2a31 180e      	movel %a1@(e,%d1:l),%d5
     ad8:	4207           	clrb %d7
     ada:	4203           	clrb %d3
     adc:	7cff           	moveq #-1,%d6
     ade:	0280 0000 00ff 	andil #255,%d0
     ae4:	d080           	addl %d0,%d0
     ae6:	3036 0800      	movew %fp@(0,%d0:l),%d0
     aea:	0280 0000 ffff 	andil #65535,%d0
     af0:	2245           	moveal %d5,%a1
     af2:	d3c0           	addal %d0,%a1
     af4:	1411           	moveb %a1@,%d2
     af6:	1029 0001      	moveb %a1@(1),%d0
     afa:	0200 000f      	andib #15,%d0
     afe:	4a02           	tstb %d2
     b00:	6d00 00bc      	bltw 0xbbe
     b04:	4201           	clrb %d1
     b06:	4a03           	tstb %d3
     b08:	6622           	bnes 0xb2c
     b0a:	1602           	moveb %d2,%d3
     b0c:	0203 003f      	andib #63,%d3
     b10:	671a           	beqs 0xb2c
     b12:	0283 0000 00ff 	andil #255,%d3
     b18:	e94b           	lslw #4,%d3
     b1a:	0643 fff0      	addiw #-16,%d3
     b1e:	3143 0030      	movew %d3,%a0@(48)
     b22:	ec0a           	lsrb #6,%d2
     b24:	0202 0001      	andib #1,%d2
     b28:	1142 0028      	moveb %d2,%a0@(40)
     b2c:	1429 0002      	moveb %a1@(2),%d2
     b30:	0c00 000f      	cmpib #15,%d0
     b34:	6242           	bhis 0xb78
     b36:	0280 0000 00ff 	andil #255,%d0
     b3c:	d080           	addl %d0,%d0
     b3e:	3035 0800      	movew %a5@(0,%d0:l),%d0
     b42:	4efb 0002      	jmp %pc@(0xb46,%d0:w)
     b46:	0198           	bclr %d0,%a0@+
     b48:	017e           	.short 0x017e
     b4a:	0322           	btst %d1,%a2@-
     b4c:	014e 0256      	movepl %fp@(598),%d0
     b50:	0032 0032 0032 	orib #50,%a2@(32,%d0:w)
     b56:	0032 0032 0020 	orib #50,%a2@(20,%d0:w)
     b5c:	0104           	btst %d0,%d4
     b5e:	00e2           	.short 0x00e2
     b60:	0032 00a2 0086 	orib #-94,%a2@(ffffffffffffff86,%d0:w)
     b66:	1002           	moveb %d2,%d0
     b68:	0200 000f      	andib #15,%d0
     b6c:	6700 04c0      	beqw 0x102e
     b70:	4402           	negb %d2
     b72:	4882           	extw %d2
     b74:	3142 002a      	movew %d2,%a0@(42)
     b78:	1028 006a      	moveb %a0@(106),%d0
     b7c:	5200           	addqb #1,%d0
     b7e:	1140 006a      	moveb %d0,%a0@(106)
     b82:	4a01           	tstb %d1
     b84:	6700 00f8      	beqw 0xc7e
     b88:	1400           	moveb %d0,%d2
     b8a:	4882           	extw %d2
     b8c:	3442           	moveaw %d2,%a2
     b8e:	7e01           	moveq #1,%d7
     b90:	b5c4           	cmpal %d4,%a2
     b92:	6c00 00e8      	bgew 0xc7c
     b96:	1601           	moveb %d1,%d3
     b98:	0280 0000 00ff 	andil #255,%d0
     b9e:	d080           	addl %d0,%d0
     ba0:	3036 0800      	movew %fp@(0,%d0:l),%d0
     ba4:	0280 0000 ffff 	andil #65535,%d0
     baa:	2245           	moveal %d5,%a1
     bac:	d3c0           	addal %d0,%a1
     bae:	1411           	moveb %a1@,%d2
     bb0:	1029 0001      	moveb %a1@(1),%d0
     bb4:	0200 000f      	andib #15,%d0
     bb8:	4a02           	tstb %d2
     bba:	6c00 ff48      	bgew 0xb04
     bbe:	72ff           	moveq #-1,%d1
     bc0:	b286           	cmpl %d6,%d1
     bc2:	6700 02c4      	beqw 0xe88
     bc6:	7201           	moveq #1,%d1
     bc8:	6000 ff3c      	braw 0xb06
     bcc:	4a02           	tstb %d2
     bce:	6700 046a      	beqw 0x103a
     bd2:	1142 006b      	moveb %d2,%a0@(107)
     bd6:	1028 006a      	moveb %a0@(106),%d0
     bda:	5200           	addqb #1,%d0
     bdc:	1140 006a      	moveb %d0,%a0@(106)
     be0:	4a01           	tstb %d1
     be2:	66a4           	bnes 0xb88
     be4:	6000 0098      	braw 0xc7e
     be8:	1602           	moveb %d2,%d3
     bea:	e80b           	lsrb #4,%d3
     bec:	1028 006a      	moveb %a0@(106),%d0
     bf0:	4a03           	tstb %d3
     bf2:	6700 0520      	beqw 0x1114
     bf6:	0c03 0001      	cmpib #1,%d3
     bfa:	6600 ff7c      	bnew 0xb78
     bfe:	0202 0003      	andib #3,%d2
     c02:	6700 04f8      	beqw 0x10fc
     c06:	0282 0000 00ff 	andil #255,%d2
     c0c:	4240           	clrw %d0
     c0e:	1030 28ff      	moveb %a0@(ffffffffffffffff,%d2:l),%d0
     c12:	3140 0022      	movew %d0,%a0@(34)
     c16:	1028 006a      	moveb %a0@(106),%d0
     c1a:	5200           	addqb #1,%d0
     c1c:	1140 006a      	moveb %d0,%a0@(106)
     c20:	4a01           	tstb %d1
     c22:	6600 ff64      	bnew 0xb88
     c26:	6056           	bras 0xc7e
     c28:	0242 00ff      	andiw #255,%d2
     c2c:	0c42 0040      	cmpiw #64,%d2
     c30:	6e00 03e2      	bgtw 0x1014
     c34:	3142 001a      	movew %d2,%a0@(26)
     c38:	1028 006a      	moveb %a0@(106),%d0
     c3c:	5200           	addqb #1,%d0
     c3e:	1140 006a      	moveb %d0,%a0@(106)
     c42:	4a01           	tstb %d1
     c44:	6600 ff42      	bnew 0xb88
     c48:	6034           	bras 0xc7e
     c4a:	7000           	moveq #0,%d0
     c4c:	1002           	moveb %d2,%d0
     c4e:	b5c0           	cmpal %d0,%a2
     c50:	6f00 ff26      	blew 0xb78
     c54:	76ff           	moveq #-1,%d3
     c56:	b686           	cmpl %d6,%d3
     c58:	6706           	beqs 0xc60
     c5a:	bc80           	cmpl %d0,%d6
     c5c:	6f00 ff1a      	blew 0xb78
     c60:	1002           	moveb %d2,%d0
     c62:	4a07           	tstb %d7
     c64:	6600 0842      	bnew 0x14a8
     c68:	1142 006a      	moveb %d2,%a0@(106)
     c6c:	7cff           	moveq #-1,%d6
     c6e:	1400           	moveb %d0,%d2
     c70:	4882           	extw %d2
     c72:	3442           	moveaw %d2,%a2
     c74:	7e01           	moveq #1,%d7
     c76:	b5c4           	cmpal %d4,%a2
     c78:	6d00 ff1c      	bltw 0xb96
     c7c:	50c1           	st %d1
     c7e:	d228 006b      	addb %a0@(107),%d1
     c82:	1141 006c      	moveb %d1,%a0@(108)
     c86:	0c6f 00ff 0030 	cmpiw #255,%sp@(48)
     c8c:	6600 f7ca      	bnew 0x458
     c90:	6000 fc74      	braw 0x906
     c94:	0c02 0001      	cmpib #1,%d2
     c98:	6700 0418      	beqw 0x10b2
     c9c:	0c02 0002      	cmpib #2,%d2
     ca0:	6600 fed6      	bnew 0xb78
     ca4:	42a8 0042      	clrl %a0@(66)
     ca8:	42a8 005c      	clrl %a0@(92)
     cac:	117c 0001 0060 	moveb #1,%a0@(96)
     cb2:	1028 006a      	moveb %a0@(106),%d0
     cb6:	5200           	addqb #1,%d0
     cb8:	1140 006a      	moveb %d0,%a0@(106)
     cbc:	4a01           	tstb %d1
     cbe:	6600 fec8      	bnew 0xb88
     cc2:	60ba           	bras 0xc7e
     cc4:	0242 00ff      	andiw #255,%d2
     cc8:	3142 0032      	movew %d2,%a0@(50)
     ccc:	1028 006a      	moveb %a0@(106),%d0
     cd0:	5200           	addqb #1,%d0
     cd2:	1140 006a      	moveb %d0,%a0@(106)
     cd6:	4a01           	tstb %d1
     cd8:	6600 feae      	bnew 0xb88
     cdc:	60a0           	bras 0xc7e
     cde:	5302           	subqb #1,%d2
     ce0:	4240           	clrw %d0
     ce2:	1002           	moveb %d2,%d0
     ce4:	b06f 0030      	cmpw %sp@(48),%d0
     ce8:	6700 fe8e      	beqw 0xb78
     cec:	0c02 0017      	cmpib #23,%d2
     cf0:	6200 fe86      	bhiw 0xb78
     cf4:	3140 001e      	movew %d0,%a0@(30)
     cf8:	762a           	moveq #42,%d3
     cfa:	c6c0           	muluw %d0,%d3
     cfc:	246f 0038      	moveal %sp@(56),%a2
     d00:	226a 0120      	moveal %a2@(288),%a1
     d04:	d3c3           	addal %d3,%a1
     d06:	2149 003e      	movel %a1,%a0@(62)
     d0a:	7600           	moveq #0,%d3
     d0c:	1629 0004      	moveb %a1@(4),%d3
     d10:	e18b           	lsll #8,%d3
     d12:	8629 0005      	orb %a1@(5),%d3
     d16:	4a83           	tstl %d3
     d18:	6600 07a0      	bnew 0x14ba
     d1c:	7600           	moveq #0,%d3
     d1e:	1629 000c      	moveb %a1@(12),%d3
     d22:	e18b           	lsll #8,%d3
     d24:	8629 000d      	orb %a1@(13),%d3
     d28:	7e00           	moveq #0,%d7
     d2a:	3e03           	movew %d3,%d7
     d2c:	117c 0001 0079 	moveb #1,%a0@(121)
     d32:	0282 0000 00ff 	andil #255,%d2
     d38:	0682 0000 0281 	addil #641,%d2
     d3e:	d482           	addl %d2,%d2
     d40:	d482           	addl %d2,%d2
     d42:	2433 2800      	movel %a3@(0,%d2:l),%d2
     d46:	d483           	addl %d3,%d2
     d48:	2142 006e      	movel %d2,%a0@(110)
     d4c:	7400           	moveq #0,%d2
     d4e:	1429 000a      	moveb %a1@(10),%d2
     d52:	e18a           	lsll #8,%d2
     d54:	8429 000b      	orb %a1@(11),%d2
     d58:	2442           	moveal %d2,%a2
     d5a:	538a           	subql #1,%a2
     d5c:	b5c3           	cmpal %d3,%a2
     d5e:	6e00 0954      	bgtw 0x16b4
     d62:	7402           	moveq #2,%d2
     d64:	3142 0072      	movew %d2,%a0@(114)
     d68:	317c ffff 0074 	movew #-1,%a0@(116)
     d6e:	4242           	clrw %d2
     d70:	1429 0007      	moveb %a1@(7),%d2
     d74:	5242           	addqw #1,%d2
     d76:	3142 0034      	movew %d2,%a0@(52)
     d7a:	2147 0036      	movel %d7,%a0@(54)
     d7e:	317c 0001 0026 	movew #1,%a0@(38)
     d84:	3f40 0030      	movew %d0,%sp@(48)
     d88:	1028 006a      	moveb %a0@(106),%d0
     d8c:	5200           	addqb #1,%d0
     d8e:	1140 006a      	moveb %d0,%a0@(106)
     d92:	4a01           	tstb %d1
     d94:	6600 fdf2      	bnew 0xb88
     d98:	6000 fee4      	braw 0xc7e
     d9c:	5302           	subqb #1,%d2
     d9e:	4240           	clrw %d0
     da0:	1002           	moveb %d2,%d0
     da2:	b06f 0030      	cmpw %sp@(48),%d0
     da6:	6700 fdd0      	beqw 0xb78
     daa:	0c02 0017      	cmpib #23,%d2
     dae:	6200 fdc8      	bhiw 0xb78
     db2:	3140 001e      	movew %d0,%a0@(30)
     db6:	762a           	moveq #42,%d3
     db8:	c6c0           	muluw %d0,%d3
     dba:	246f 0038      	moveal %sp@(56),%a2
     dbe:	226a 0120      	moveal %a2@(288),%a1
     dc2:	d3c3           	addal %d3,%a1
     dc4:	2149 003e      	movel %a1,%a0@(62)
     dc8:	7600           	moveq #0,%d3
     dca:	1629 0004      	moveb %a1@(4),%d3
     dce:	e18b           	lsll #8,%d3
     dd0:	8629 0005      	orb %a1@(5),%d3
     dd4:	4a83           	tstl %d3
     dd6:	6600 072c      	bnew 0x1504
     dda:	7600           	moveq #0,%d3
     ddc:	1629 000c      	moveb %a1@(12),%d3
     de0:	e18b           	lsll #8,%d3
     de2:	8629 000d      	orb %a1@(13),%d3
     de6:	117c 0001 0079 	moveb #1,%a0@(121)
     dec:	0282 0000 00ff 	andil #255,%d2
     df2:	0682 0000 0281 	addil #641,%d2
     df8:	d482           	addl %d2,%d2
     dfa:	d482           	addl %d2,%d2
     dfc:	2433 2800      	movel %a3@(0,%d2:l),%d2
     e00:	d483           	addl %d3,%d2
     e02:	2142 006e      	movel %d2,%a0@(110)
     e06:	7400           	moveq #0,%d2
     e08:	1429 000a      	moveb %a1@(10),%d2
     e0c:	e18a           	lsll #8,%d2
     e0e:	8429 000b      	orb %a1@(11),%d2
     e12:	7e00           	moveq #0,%d7
     e14:	3e02           	movew %d2,%d7
     e16:	2442           	moveal %d2,%a2
     e18:	538a           	subql #1,%a2
     e1a:	b5c3           	cmpal %d3,%a2
     e1c:	6e00 08a6      	bgtw 0x16c4
     e20:	7402           	moveq #2,%d2
     e22:	3142 0072      	movew %d2,%a0@(114)
     e26:	317c ffff 0074 	movew #-1,%a0@(116)
     e2c:	2628 0036      	movel %a0@(54),%d3
     e30:	be83           	cmpl %d3,%d7
     e32:	6c06           	bges 0xe3a
     e34:	317c 0001 0026 	movew #1,%a0@(38)
     e3a:	4268 0034      	clrw %a0@(52)
     e3e:	7400           	moveq #0,%d2
     e40:	1429 0008      	moveb %a1@(8),%d2
     e44:	e18a           	lsll #8,%d2
     e46:	8429 0009      	orb %a1@(9),%d2
     e4a:	9682           	subl %d2,%d3
     e4c:	2143 0036      	movel %d3,%a0@(54)
     e50:	3f40 0030      	movew %d0,%sp@(48)
     e54:	1028 006a      	moveb %a0@(106),%d0
     e58:	5200           	addqb #1,%d0
     e5a:	1140 006a      	moveb %d0,%a0@(106)
     e5e:	4a01           	tstb %d1
     e60:	6600 fd26      	bnew 0xb88
     e64:	6000 fe18      	braw 0xc7e
     e68:	0282 0000 00ff 	andil #255,%d2
     e6e:	4442           	negw %d2
     e70:	3142 0032      	movew %d2,%a0@(50)
     e74:	1028 006a      	moveb %a0@(106),%d0
     e78:	5200           	addqb #1,%d0
     e7a:	1140 006a      	moveb %d0,%a0@(106)
     e7e:	4a01           	tstb %d1
     e80:	6600 fd06      	bnew 0xb88
     e84:	6000 fdf8      	braw 0xc7e
     e88:	2c0a           	movel %a2,%d6
     e8a:	7201           	moveq #1,%d1
     e8c:	6000 fc78      	braw 0xb06
     e90:	1a28 0079      	moveb %a0@(121),%d5
     e94:	3828 0072      	movew %a0@(114),%d4
     e98:	6000 f73a      	braw 0x5d4
     e9c:	3428 0034      	movew %a0@(52),%d2
     ea0:	0c42 0001      	cmpiw #1,%d2
     ea4:	6300 04aa      	blsw 0x1350
     ea8:	5342           	subqw #1,%d2
     eaa:	3142 0034      	movew %d2,%a0@(52)
     eae:	2428 0036      	movel %a0@(54),%d2
     eb2:	3141 0072      	movew %d1,%a0@(114)
     eb6:	3142 0074      	movew %d2,%a0@(116)
     eba:	7200           	moveq #0,%d1
     ebc:	3228 001e      	movew %a0@(30),%d1
     ec0:	0681 0000 0281 	addil #641,%d1
     ec6:	d281           	addl %d1,%d1
     ec8:	d281           	addl %d1,%d1
     eca:	2173 1800 006e 	movel %a3@(0,%d1:l),%a0@(110)
     ed0:	1a28 0079      	moveb %a0@(121),%d5
     ed4:	6000 f6fe      	braw 0x5d4
     ed8:	e849           	lsrw #4,%d1
     eda:	0281 0000 ffff 	andil #65535,%d1
     ee0:	6000 f5fa      	braw 0x4dc
     ee4:	226b 09fe      	moveal %a3@(2558),%a1
     ee8:	7600           	moveq #0,%d3
     eea:	1601           	moveb %d1,%d3
     eec:	0683 1fff ffff 	addil #536870911,%d3
     ef2:	e78b           	lsll #3,%d3
     ef4:	2269 011c      	moveal %a1@(284),%a1
     ef8:	d3c3           	addal %d3,%a1
     efa:	3142 0020      	movew %d2,%a0@(32)
     efe:	2149 003a      	movel %a1,%a0@(58)
     f02:	0241 00ff      	andiw #255,%d1
     f06:	3141 001c      	movew %d1,%a0@(28)
     f0a:	42a8 0042      	clrl %a0@(66)
     f0e:	42a8 005c      	clrl %a0@(92)
     f12:	117c 0001 0060 	moveb #1,%a0@(96)
     f18:	7600           	moveq #0,%d3
     f1a:	1629 0003      	moveb %a1@(3),%d3
     f1e:	2143 004c      	movel %d3,%a0@(76)
     f22:	7200           	moveq #0,%d1
     f24:	1229 0004      	moveb %a1@(4),%d1
     f28:	2141 0050      	movel %d1,%a0@(80)
     f2c:	1229 0005      	moveb %a1@(5),%d1
     f30:	2141 0054      	movel %d1,%a0@(84)
     f34:	1229 0006      	moveb %a1@(6),%d1
     f38:	2141 0058      	movel %d1,%a0@(88)
     f3c:	4268 0062      	clrw %a0@(98)
     f40:	1211           	moveb %a1@,%d1
     f42:	45fa 3344      	lea %pc@(0x4288),%a2
     f46:	1232 1800      	moveb %a2@(0,%d1:l),%d1
     f4a:	0241 00ff      	andiw #255,%d1
     f4e:	5241           	addqw #1,%d1
     f50:	3141 0068      	movew %d1,%a0@(104)
     f54:	7200           	moveq #0,%d1
     f56:	1229 0001      	moveb %a1@(1),%d1
     f5a:	45fa 331c      	lea %pc@(0x4278),%a2
     f5e:	1232 1800      	moveb %a2@(0,%d1:l),%d1
     f62:	0241 00ff      	andiw #255,%d1
     f66:	3141 0064      	movew %d1,%a0@(100)
     f6a:	7200           	moveq #0,%d1
     f6c:	1229 0002      	moveb %a1@(2),%d1
     f70:	43fa 32f6      	lea %pc@(0x4268),%a1
     f74:	1231 1800      	moveb %a1@(0,%d1:l),%d1
     f78:	0241 00ff      	andiw #255,%d1
     f7c:	3141 0066      	movew %d1,%a0@(102)
     f80:	4228 000c      	clrb %a0@(12)
     f84:	7200           	moveq #0,%d1
     f86:	d683           	addl %d3,%d3
     f88:	43fa 331e      	lea %pc@(0x42a8),%a1
     f8c:	3631 3800      	movew %a1@(0,%d3:l),%d3
     f90:	0283 0000 ffff 	andil #65535,%d3
     f96:	d283           	addl %d3,%d1
     f98:	0c81 0000 03ff 	cmpil #1023,%d1
     f9e:	6e00 00e6      	bgtw 0x1086
     fa2:	2141 005c      	movel %d1,%a0@(92)
     fa6:	e849           	lsrw #4,%d1
     fa8:	0281 0000 ffff 	andil #65535,%d1
     fae:	6000 f52c      	braw 0x4dc
     fb2:	3628 0048      	movew %a0@(72),%d3
     fb6:	d668 004a      	addw %a0@(74),%d3
     fba:	3143 0048      	movew %d3,%a0@(72)
     fbe:	0c43 000f      	cmpiw #15,%d3
     fc2:	6f00 ff14      	blew 0xed8
     fc6:	1a28 0046      	moveb %a0@(70),%d5
     fca:	0c05 ff8e      	cmpib #-114,%d5
     fce:	6200 0400      	bhiw 0x13d0
     fd2:	1805           	moveb %d5,%d4
     fd4:	5204           	addqb #1,%d4
     fd6:	0285 0000 00ff 	andil #255,%d5
     fdc:	2245           	moveal %d5,%a1
     fde:	d3c5           	addal %d5,%a1
     fe0:	45fa 33de      	lea %pc@(0x43c0),%a2
     fe4:	7a00           	moveq #0,%d5
     fe6:	3a31 a800      	movew %a1@(0,%a2:l),%d5
     fea:	1144 0046      	moveb %d4,%a0@(70)
     fee:	9285           	subl %d5,%d1
     ff0:	6b00 03ec      	bmiw 0x13de
     ff4:	2141 005c      	movel %d1,%a0@(92)
     ff8:	e849           	lsrw #4,%d1
     ffa:	0281 0000 ffff 	andil #65535,%d1
    1000:	0643 fff0      	addiw #-16,%d3
    1004:	3143 0048      	movew %d3,%a0@(72)
    1008:	6000 f4d2      	braw 0x4dc
    100c:	1028 006a      	moveb %a0@(106),%d0
    1010:	6000 fa90      	braw 0xaa2
    1014:	317c 0040 001a 	movew #64,%a0@(26)
    101a:	1028 006a      	moveb %a0@(106),%d0
    101e:	5200           	addqb #1,%d0
    1020:	1140 006a      	moveb %d0,%a0@(106)
    1024:	4a01           	tstb %d1
    1026:	6600 fb60      	bnew 0xb88
    102a:	6000 fc52      	braw 0xc7e
    102e:	e80a           	lsrb #4,%d2
    1030:	4882           	extw %d2
    1032:	3142 002a      	movew %d2,%a0@(42)
    1036:	6000 fb40      	braw 0xb78
    103a:	50e8 006b      	st %a0@(107)
    103e:	1028 006a      	moveb %a0@(106),%d0
    1042:	5200           	addqb #1,%d0
    1044:	1140 006a      	moveb %d0,%a0@(106)
    1048:	4a01           	tstb %d1
    104a:	6600 fb3c      	bnew 0xb88
    104e:	6000 fc2e      	braw 0xc7e
    1052:	7a02           	moveq #2,%d5
    1054:	788f           	moveq #-113,%d4
    1056:	1144 0046      	moveb %d4,%a0@(70)
    105a:	2601           	movel %d1,%d3
    105c:	9685           	subl %d5,%d3
    105e:	2143 005c      	movel %d3,%a0@(92)
    1062:	2228 0054      	movel %a0@(84),%d1
    1066:	ed89           	lsll #6,%d1
    1068:	3241           	moveaw %d1,%a1
    106a:	b3c3           	cmpal %d3,%a1
    106c:	6d00 f468      	bltw 0x4d6
    1070:	2141 005c      	movel %d1,%a0@(92)
    1074:	7802           	moveq #2,%d4
    1076:	2144 0042      	movel %d4,%a0@(66)
    107a:	e849           	lsrw #4,%d1
    107c:	0281 0000 ffff 	andil #65535,%d1
    1082:	6000 f458      	braw 0x4dc
    1086:	217c 0000 0400 	movel #1024,%a0@(92)
    108c:	005c 
    108e:	7e01           	moveq #1,%d7
    1090:	2147 0042      	movel %d7,%a0@(66)
    1094:	2228 0050      	movel %a0@(80),%d1
    1098:	226f 0040      	moveal %sp@(64),%a1
    109c:	1171 1800 0046 	moveb %a1@(0,%d1:l),%a0@(70)
    10a2:	720f           	moveq #15,%d1
    10a4:	b2a8 0054      	cmpl %a0@(84),%d1
    10a8:	6700 03ca      	beqw 0x1474
    10ac:	7240           	moveq #64,%d1
    10ae:	6000 f42c      	braw 0x4dc
    10b2:	2028 005c      	movel %a0@(92),%d0
    10b6:	ec80           	asrl #6,%d0
    10b8:	2600           	movel %d0,%d3
    10ba:	0283 0000 ffff 	andil #65535,%d3
    10c0:	7410           	moveq #16,%d2
    10c2:	9483           	subl %d3,%d2
    10c4:	e282           	asrl #1,%d2
    10c6:	2268 0058      	moveal %a0@(88),%a1
    10ca:	246f 0040      	moveal %sp@(64),%a2
    10ce:	1632 9800      	moveb %a2@(0,%a1:l),%d3
    10d2:	d602           	addb %d2,%d3
    10d4:	1143 0046      	moveb %d3,%a0@(70)
    10d8:	3140 004a      	movew %d0,%a0@(74)
    10dc:	317c 0010 0048 	movew #16,%a0@(72)
    10e2:	7003           	moveq #3,%d0
    10e4:	2140 0042      	movel %d0,%a0@(66)
    10e8:	1028 006a      	moveb %a0@(106),%d0
    10ec:	5200           	addqb #1,%d0
    10ee:	1140 006a      	moveb %d0,%a0@(106)
    10f2:	4a01           	tstb %d1
    10f4:	6600 fa92      	bnew 0xb88
    10f8:	6000 fb84      	braw 0xc7e
    10fc:	4268 0022      	clrw %a0@(34)
    1100:	1028 006a      	moveb %a0@(106),%d0
    1104:	5200           	addqb #1,%d0
    1106:	1140 006a      	moveb %d0,%a0@(106)
    110a:	4a01           	tstb %d1
    110c:	6600 fa7a      	bnew 0xb88
    1110:	6000 fb6c      	braw 0xc7e
    1114:	0202 0003      	andib #3,%d2
    1118:	67e2           	beqs 0x10fc
    111a:	0282 0000 00ff 	andil #255,%d2
    1120:	1430 28ff      	moveb %a0@(ffffffffffffffff,%d2:l),%d2
    1124:	6700 040e      	beqw 0x1534
    1128:	0242 00ff      	andiw #255,%d2
    112c:	3142 0022      	movew %d2,%a0@(34)
    1130:	1028 006a      	moveb %a0@(106),%d0
    1134:	5200           	addqb #1,%d0
    1136:	1140 006a      	moveb %d0,%a0@(106)
    113a:	4a01           	tstb %d1
    113c:	6600 fa4a      	bnew 0xb88
    1140:	6000 fb3c      	braw 0xc7e
    1144:	0c00 ffff      	cmpib #-1,%d0
    1148:	6700 0346      	beqw 0x1490
    114c:	1628 0294      	moveb %a0@(660),%d3
    1150:	1140 0294      	moveb %d0,%a0@(660)
    1154:	1228 0295      	moveb %a0@(661),%d1
    1158:	5201           	addqb #1,%d1
    115a:	0201 001f      	andib #31,%d1
    115e:	1141 0295      	moveb %d1,%a0@(661)
    1162:	1401           	moveb %d1,%d2
    1164:	4882           	extw %d2
    1166:	3242           	moveaw %d2,%a1
    1168:	2409           	movel %a1,%d2
    116a:	e98a           	lsll #4,%d2
    116c:	43f0 2800      	lea %a0@(0,%d2:l),%a1
    1170:	45e9 02fc      	lea %a1@(764),%a2
    1174:	24e8 006e      	movel %a0@(110),%a2@+
    1178:	24e8 0072      	movel %a0@(114),%a2@+
    117c:	24e8 0076      	movel %a0@(118),%a2@+
    1180:	24a8 007a      	movel %a0@(122),%a2@
    1184:	1828 0018      	moveb %a0@(24),%d4
    1188:	4884           	extw %d4
    118a:	45e9 0306      	lea %a1@(774),%a2
    118e:	7400           	moveq #0,%d2
    1190:	1412           	moveb %a2@,%d2
    1192:	c4c4           	muluw %d4,%d2
    1194:	e88a           	lsrl #4,%d2
    1196:	1482           	moveb %d2,%a2@
    1198:	4a03           	tstb %d3
    119a:	6606           	bnes 0x11a2
    119c:	137c 0001 0307 	moveb #1,%a1@(775)
    11a2:	9200           	subb %d0,%d1
    11a4:	6b00 0a50      	bmiw 0x1bf6
    11a8:	1001           	moveb %d1,%d0
    11aa:	4880           	extw %d0
    11ac:	3240           	moveaw %d0,%a1
    11ae:	7607           	moveq #7,%d3
    11b0:	c283           	andl %d3,%d1
    11b2:	2a09           	movel %a1,%d5
    11b4:	e98d           	lsll #4,%d5
    11b6:	2008           	movel %a0,%d0
    11b8:	d085           	addl %d5,%d0
    11ba:	45e8 02ec      	lea %a0@(748),%a2
    11be:	2240           	moveal %d0,%a1
    11c0:	43e9 02fc      	lea %a1@(764),%a1
    11c4:	24d9           	movel %a1@+,%a2@+
    11c6:	24d9           	movel %a1@+,%a2@+
    11c8:	24d9           	movel %a1@+,%a2@+
    11ca:	2491           	movel %a1@,%a2@
    11cc:	2240           	moveal %d0,%a1
    11ce:	4229 0306      	clrb %a1@(774)
    11d2:	3268 02f4      	moveaw %a0@(756),%a1
    11d6:	45fa 31c8      	lea %pc@(0x43a0),%a2
    11da:	1232 1800      	moveb %a2@(0,%d1:l),%d1
    11de:	4881           	extw %d1
    11e0:	3009           	movew %a1,%d0
    11e2:	48c0           	extl %d0
    11e4:	c1c1           	mulsw %d1,%d0
    11e6:	720c           	moveq #12,%d1
    11e8:	e2a0           	asrl %d1,%d0
    11ea:	d2c0           	addaw %d0,%a1
    11ec:	3149 02f4      	movew %a1,%a0@(756)
    11f0:	7402           	moveq #2,%d2
    11f2:	b4af 002c      	cmpl %sp@(44),%d2
    11f6:	6700 f52c      	beqw 0x724
    11fa:	41e8 027e      	lea %a0@(638),%a0
    11fe:	54af 002c      	addql #2,%sp@(44)
    1202:	41e8 027e      	lea %a0@(638),%a0
    1206:	7604           	moveq #4,%d3
    1208:	b6af 002c      	cmpl %sp@(44),%d3
    120c:	6600 f1f6      	bnew 0x404
    1210:	6000 f512      	braw 0x724
    1214:	4240           	clrw %d0
    1216:	102b 07f2      	moveb %a3@(2034),%d0
    121a:	33c0 00df f0d8 	movew %d0,0xdff0d8
    1220:	33eb 07f0 00df 	movew %a3@(2032),0xdff0d6
    1226:	f0d6 
    1228:	7404           	moveq #4,%d2
    122a:	223c 00ff ffff 	movel #16777215,%d1
    1230:	6000 f586      	braw 0x7b8
    1234:	33fc 0004 00df 	movew #4,0xdff096
    123a:	f096 
    123c:	23eb 056a 00df 	movel %a3@(1386),0xdff0c0
    1242:	f0c0 
    1244:	302b 056e      	movew %a3@(1390),%d0
    1248:	e248           	lsrw #1,%d0
    124a:	33c0 00df f0c4 	movew %d0,0xdff0c4
    1250:	33fc 0000 00df 	movew #0,0xdff0c8
    1256:	f0c8 
    1258:	422b 0575      	clrb %a3@(1397)
    125c:	33fc 0071 00df 	movew #113,0xdff0c6
    1262:	f0c6 
    1264:	6000 f512      	braw 0x778
    1268:	33fc 0002 00df 	movew #2,0xdff096
    126e:	f096 
    1270:	23eb 02ec 00df 	movel %a3@(748),0xdff0b0
    1276:	f0b0 
    1278:	302b 02f0      	movew %a3@(752),%d0
    127c:	e248           	lsrw #1,%d0
    127e:	33c0 00df f0b4 	movew %d0,0xdff0b4
    1284:	33fc 0000 00df 	movew #0,0xdff0b8
    128a:	f0b8 
    128c:	422b 02f7      	clrb %a3@(759)
    1290:	33fc 0071 00df 	movew #113,0xdff0b6
    1296:	f0b6 
    1298:	6000 f4c2      	braw 0x75c
    129c:	33fc 0001 00df 	movew #1,0xdff096
    12a2:	f096 
    12a4:	23eb 006e 00df 	movel %a3@(110),0xdff0a0
    12aa:	f0a0 
    12ac:	302b 0072      	movew %a3@(114),%d0
    12b0:	e248           	lsrw #1,%d0
    12b2:	33c0 00df f0a4 	movew %d0,0xdff0a4
    12b8:	33fc 0000 00df 	movew #0,0xdff0a8
    12be:	f0a8 
    12c0:	422b 0079      	clrb %a3@(121)
    12c4:	33fc 0071 00df 	movew #113,0xdff0a6
    12ca:	f0a6 
    12cc:	6000 f472      	braw 0x740
    12d0:	4a05           	tstb %d5
    12d2:	6700 f3e4      	beqw 0x6b8
    12d6:	7c00           	moveq #0,%d6
    12d8:	3c28 001e      	movew %a0@(30),%d6
    12dc:	0686 0000 0281 	addil #641,%d6
    12e2:	dc86           	addl %d6,%d6
    12e4:	dc86           	addl %d6,%d6
    12e6:	2473 6800      	moveal %a3@(0,%d6:l),%a2
    12ea:	2c28 006e      	movel %a0@(110),%d6
    12ee:	9c8a           	subl %a2,%d6
    12f0:	7e00           	moveq #0,%d7
    12f2:	1e01           	moveb %d1,%d7
    12f4:	2f47 0030      	movel %d7,%sp@(48)
    12f8:	3e02           	movew %d2,%d7
    12fa:	9e46           	subw %d6,%d7
    12fc:	9e44           	subw %d4,%d7
    12fe:	b847           	cmpw %d7,%d4
    1300:	6400 023c      	bccw 0x153e
    1304:	7802           	moveq #2,%d4
    1306:	3144 0072      	movew %d4,%a0@(114)
    130a:	2e2f 0030      	movel %sp@(48),%d7
    130e:	eeae           	lsrl %d7,%d6
    1310:	dc8a           	addl %a2,%d6
    1312:	2146 006e      	movel %d6,%a0@(110)
    1316:	6000 f388      	braw 0x6a0
    131a:	4268 0074      	clrw %a0@(116)
    131e:	117c 0001 0079 	moveb #1,%a0@(121)
    1324:	216b 0a04 006e 	movel %a3@(2564),%a0@(110)
    132a:	7600           	moveq #0,%d3
    132c:	1629 000c      	moveb %a1@(12),%d3
    1330:	e18b           	lsll #8,%d3
    1332:	8629 000d      	orb %a1@(13),%d3
    1336:	4240           	clrw %d0
    1338:	1029 0007      	moveb %a1@(7),%d0
    133c:	5240           	addqw #1,%d0
    133e:	3140 0034      	movew %d0,%a0@(52)
    1342:	2143 0036      	movel %d3,%a0@(54)
    1346:	317c 0001 0026 	movew #1,%a0@(38)
    134c:	6000 f10a      	braw 0x458
    1350:	7600           	moveq #0,%d3
    1352:	1629 0008      	moveb %a1@(8),%d3
    1356:	e18b           	lsll #8,%d3
    1358:	8629 0009      	orb %a1@(9),%d3
    135c:	2428 0036      	movel %a0@(54),%d2
    1360:	4245           	clrw %d5
    1362:	1a29 0007      	moveb %a1@(7),%d5
    1366:	3145 0034      	movew %d5,%a0@(52)
    136a:	4a68 0026      	tstw %a0@(38)
    136e:	6e00 f214      	bgtw 0x584
    1372:	2c02           	movel %d2,%d6
    1374:	9c83           	subl %d3,%d6
    1376:	7600           	moveq #0,%d3
    1378:	1611           	moveb %a1@,%d3
    137a:	e18b           	lsll #8,%d3
    137c:	8629 0001      	orb %a1@(1),%d3
    1380:	3403           	movew %d3,%d2
    1382:	7e00           	moveq #0,%d7
    1384:	3e03           	movew %d3,%d7
    1386:	9686           	subl %d6,%d3
    1388:	6b00 00a2      	bmiw 0x142c
    138c:	2147 0036      	movel %d7,%a0@(54)
    1390:	317c 0001 0026 	movew #1,%a0@(38)
    1396:	4a83           	tstl %d3
    1398:	6600 f218      	bnew 0x5b2
    139c:	5345           	subqw #1,%d5
    139e:	3145 0034      	movew %d5,%a0@(52)
    13a2:	3141 0072      	movew %d1,%a0@(114)
    13a6:	3142 0074      	movew %d2,%a0@(116)
    13aa:	7200           	moveq #0,%d1
    13ac:	3228 001e      	movew %a0@(30),%d1
    13b0:	0681 0000 0281 	addil #641,%d1
    13b6:	d281           	addl %d1,%d1
    13b8:	d281           	addl %d1,%d1
    13ba:	2173 1800 006e 	movel %a3@(0,%d1:l),%a0@(110)
    13c0:	1a28 0079      	moveb %a0@(121),%d5
    13c4:	6000 f20e      	braw 0x5d4
    13c8:	3140 001a      	movew %d0,%a0@(26)
    13cc:	6000 f072      	braw 0x440
    13d0:	7a02           	moveq #2,%d5
    13d2:	788f           	moveq #-113,%d4
    13d4:	1144 0046      	moveb %d4,%a0@(70)
    13d8:	9285           	subl %d5,%d1
    13da:	6a00 fc18      	bplw 0xff4
    13de:	42a8 005c      	clrl %a0@(92)
    13e2:	7200           	moveq #0,%d1
    13e4:	0643 fff0      	addiw #-16,%d3
    13e8:	3143 0048      	movew %d3,%a0@(72)
    13ec:	6000 f0ee      	braw 0x4dc
    13f0:	7802           	moveq #2,%d4
    13f2:	3144 0072      	movew %d4,%a0@(114)
    13f6:	317c ffff 0074 	movew #-1,%a0@(116)
    13fc:	4228 000d      	clrb %a0@(13)
    1400:	7a01           	moveq #1,%d5
    1402:	6000 f1d0      	braw 0x5d4
    1406:	d483           	addl %d3,%d2
    1408:	4245           	clrw %d5
    140a:	1a29 0007      	moveb %a1@(7),%d5
    140e:	3145 0034      	movew %d5,%a0@(52)
    1412:	2c02           	movel %d2,%d6
    1414:	9c83           	subl %d3,%d6
    1416:	7600           	moveq #0,%d3
    1418:	1611           	moveb %a1@,%d3
    141a:	e18b           	lsll #8,%d3
    141c:	8629 0001      	orb %a1@(1),%d3
    1420:	3403           	movew %d3,%d2
    1422:	7e00           	moveq #0,%d7
    1424:	3e03           	movew %d3,%d7
    1426:	9686           	subl %d6,%d3
    1428:	6a00 ff62      	bplw 0x138c
    142c:	2146 0036      	movel %d6,%a0@(54)
    1430:	3406           	movew %d6,%d2
    1432:	3141 0072      	movew %d1,%a0@(114)
    1436:	3142 0074      	movew %d2,%a0@(116)
    143a:	7200           	moveq #0,%d1
    143c:	3228 001e      	movew %a0@(30),%d1
    1440:	0681 0000 0281 	addil #641,%d1
    1446:	d281           	addl %d1,%d1
    1448:	d281           	addl %d1,%d1
    144a:	2173 1800 006e 	movel %a3@(0,%d1:l),%a0@(110)
    1450:	1a28 0079      	moveb %a0@(121),%d5
    1454:	6000 f17e      	braw 0x5d4
    1458:	d483           	addl %d3,%d2
    145a:	2142 0036      	movel %d2,%a0@(54)
    145e:	317c ffff 0026 	movew #-1,%a0@(38)
    1464:	4a83           	tstl %d3
    1466:	6600 f14a      	bnew 0x5b2
    146a:	5345           	subqw #1,%d5
    146c:	3145 0034      	movew %d5,%a0@(52)
    1470:	6000 ff30      	braw 0x13a2
    1474:	7610           	moveq #16,%d3
    1476:	2143 0054      	movel %d3,%a0@(84)
    147a:	7240           	moveq #64,%d1
    147c:	6000 f05e      	braw 0x4dc
    1480:	7402           	moveq #2,%d2
    1482:	3142 0072      	movew %d2,%a0@(114)
    1486:	317c ffff 0074 	movew #-1,%a0@(116)
    148c:	6000 f4e0      	braw 0x96e
    1490:	4228 0016      	clrb %a0@(22)
    1494:	4228 0284      	clrb %a0@(644)
    1498:	317c 00ff 0294 	movew #255,%a0@(660)
    149e:	7207           	moveq #7,%d1
    14a0:	327c 001f      	moveaw #31,%a1
    14a4:	6000 fd0c      	braw 0x11b2
    14a8:	1142 006a      	moveb %d2,%a0@(106)
    14ac:	4201           	clrb %d1
    14ae:	d228 006b      	addb %a0@(107),%d1
    14b2:	1141 006c      	moveb %d1,%a0@(108)
    14b6:	6000 f7ce      	braw 0xc86
    14ba:	4268 0074      	clrw %a0@(116)
    14be:	117c 0001 0079 	moveb #1,%a0@(121)
    14c4:	0282 0000 00ff 	andil #255,%d2
    14ca:	0682 0000 0281 	addil #641,%d2
    14d0:	d482           	addl %d2,%d2
    14d2:	d482           	addl %d2,%d2
    14d4:	2173 2800 006e 	movel %a3@(0,%d2:l),%a0@(110)
    14da:	7e00           	moveq #0,%d7
    14dc:	1e29 000c      	moveb %a1@(12),%d7
    14e0:	e18f           	lsll #8,%d7
    14e2:	8e29 000d      	orb %a1@(13),%d7
    14e6:	4242           	clrw %d2
    14e8:	1429 0007      	moveb %a1@(7),%d2
    14ec:	5242           	addqw #1,%d2
    14ee:	3142 0034      	movew %d2,%a0@(52)
    14f2:	2147 0036      	movel %d7,%a0@(54)
    14f6:	317c 0001 0026 	movew #1,%a0@(38)
    14fc:	3f40 0030      	movew %d0,%sp@(48)
    1500:	6000 f886      	braw 0xd88
    1504:	4268 0074      	clrw %a0@(116)
    1508:	117c 0001 0079 	moveb #1,%a0@(121)
    150e:	0282 0000 00ff 	andil #255,%d2
    1514:	0682 0000 0281 	addil #641,%d2
    151a:	d482           	addl %d2,%d2
    151c:	d482           	addl %d2,%d2
    151e:	2173 2800 006e 	movel %a3@(0,%d2:l),%a0@(110)
    1524:	7e00           	moveq #0,%d7
    1526:	1e29 000a      	moveb %a1@(10),%d7
    152a:	e18f           	lsll #8,%d7
    152c:	8e29 000b      	orb %a1@(11),%d7
    1530:	6000 f8fa      	braw 0xe2c
    1534:	5200           	addqb #1,%d0
    1536:	1140 006a      	moveb %d0,%a0@(106)
    153a:	6000 f64c      	braw 0xb88
    153e:	d844           	addw %d4,%d4
    1540:	3e06           	movew %d6,%d7
    1542:	9e42           	subw %d2,%d7
    1544:	d847           	addw %d7,%d4
    1546:	0284 0000 ffff 	andil #65535,%d4
    154c:	242f 0030      	movel %sp@(48),%d2
    1550:	e4a4           	asrl %d2,%d4
    1552:	3144 0072      	movew %d4,%a0@(114)
    1556:	2e2f 0030      	movel %sp@(48),%d7
    155a:	eeae           	lsrl %d7,%d6
    155c:	dc8a           	addl %a2,%d6
    155e:	2146 006e      	movel %d6,%a0@(110)
    1562:	6000 f13c      	braw 0x6a0
    1566:	2c6b 09fe      	moveal %a3@(2558),%fp
    156a:	224b           	moveal %a3,%a1
    156c:	7e00           	moveq #0,%d7
    156e:	45fa 33f4      	lea %pc@(0x4964),%a2
    1572:	2f4a 0030      	movel %a2,%sp@(48)
    1576:	4bfa 048e      	lea %pc@(0x1a06),%a5
    157a:	2f4d 0038      	movel %a5,%sp@(56)
    157e:	45fa 2cf8      	lea %pc@(0x4278),%a2
    1582:	2f4a 003c      	movel %a2,%sp@(60)
    1586:	4bfa 2ce0      	lea %pc@(0x4268),%a5
    158a:	2f4d 0040      	movel %a5,%sp@(64)
    158e:	45eb 077a      	lea %a3@(1914),%a2
    1592:	2f4a 0044      	movel %a2,%sp@(68)
    1596:	4bfa 2d00      	lea %pc@(0x4298),%a5
    159a:	2f4d 002c      	movel %a5,%sp@(44)
    159e:	2209           	movel %a1,%d1
    15a0:	0681 0000 027e 	addil #638,%d1
    15a6:	1429 000e      	moveb %a1@(14),%d2
    15aa:	2007           	movel %d7,%d0
    15ac:	5280           	addql #1,%d0
    15ae:	4a02           	tstb %d2
    15b0:	6700 0122      	beqw 0x16d4
    15b4:	5302           	subqb #1,%d2
    15b6:	1342 000e      	moveb %d2,%a1@(14)
    15ba:	2e00           	movel %d0,%d7
    15bc:	2241           	moveal %d1,%a1
    15be:	7003           	moveq #3,%d0
    15c0:	b087           	cmpl %d7,%d0
    15c2:	6cda           	bges 0x159e
    15c4:	102b 09fd      	moveb %a3@(2557),%d0
    15c8:	5300           	subqb #1,%d0
    15ca:	1740 09fd      	moveb %d0,%a3@(2557)
    15ce:	6600 ee0e      	bnew 0x3de
    15d2:	422b 0010      	clrb %a3@(16)
    15d6:	422b 028e      	clrb %a3@(654)
    15da:	422b 050c      	clrb %a3@(1292)
    15de:	422b 078a      	clrb %a3@(1930)
    15e2:	102b 09fa      	moveb %a3@(2554),%d0
    15e6:	162e 0001      	moveb %fp@(1),%d3
    15ea:	7200           	moveq #0,%d1
    15ec:	1203           	moveb %d3,%d1
    15ee:	5381           	subql #1,%d1
    15f0:	4a00           	tstb %d0
    15f2:	6d00 0682      	bltw 0x1c76
    15f6:	1400           	moveb %d0,%d2
    15f8:	4882           	extw %d2
    15fa:	3242           	moveaw %d2,%a1
    15fc:	b289           	cmpl %a1,%d1
    15fe:	6f00 0716      	blew 0x1d16
    1602:	1740 09f8      	moveb %d0,%a3@(2552)
    1606:	342e 010e      	movew %fp@(270),%d2
    160a:	5242           	addqw #1,%d2
    160c:	3d42 010e      	movew %d2,%fp@(270)
    1610:	326e 0110      	moveaw %fp@(272),%a1
    1614:	6b00 071a      	bmiw 0x1d30
    1618:	b449           	cmpw %a1,%d2
    161a:	6d06           	blts 0x1622
    161c:	3d6e 0112 010e 	movew %fp@(274),%fp@(270)
    1622:	50eb 09fa      	st %a3@(2554)
    1626:	142b 09fb      	moveb %a3@(2555),%d2
    162a:	6b00 0714      	bmiw 0x1d40
    162e:	422b 09f8      	clrb %a3@(2552)
    1632:	102b 1c74      	moveb %a3@(7284),%d0
    1636:	6600 06ba      	bnew 0x1cf2
    163a:	4882           	extw %d2
    163c:	3d42 010e      	movew %d2,%fp@(270)
    1640:	b46e 0110      	cmpw %fp@(272),%d2
    1644:	6d00 088c      	bltw 0x1ed2
    1648:	3d6e 0112 010e 	movew %fp@(274),%fp@(270)
    164e:	50eb 09fb      	st %a3@(2555)
    1652:	0c03 0001      	cmpib #1,%d3
    1656:	6222           	bhis 0x167a
    1658:	422b 09f8      	clrb %a3@(2552)
    165c:	302e 010e      	movew %fp@(270),%d0
    1660:	5240           	addqw #1,%d0
    1662:	3d40 010e      	movew %d0,%fp@(270)
    1666:	322e 0110      	movew %fp@(272),%d1
    166a:	4a40           	tstw %d0
    166c:	6d00 0764      	bltw 0x1dd2
    1670:	b240           	cmpw %d0,%d1
    1672:	6e06           	bgts 0x167a
    1674:	3d6e 0112 010e 	movew %fp@(274),%fp@(270)
    167a:	122b 09fc      	moveb %a3@(2556),%d1
    167e:	0c01 002f      	cmpib #47,%d1
    1682:	6200 06d6      	bhiw 0x1d5a
    1686:	1741 09fd      	moveb %d1,%a3@(2557)
    168a:	42af 002c      	clrl %sp@(44)
    168e:	43fa 2e50      	lea %pc@(0x44e0),%a1
    1692:	2f49 0034      	movel %a1,%sp@(52)
    1696:	702a           	moveq #42,%d0
    1698:	c0fc 0000      	muluw #0,%d0
    169c:	2f40 003c      	movel %d0,%sp@(60)
    16a0:	4dfa 32c2      	lea %pc@(0x4964),%fp
    16a4:	4bfa f4a0      	lea %pc@(0xb46),%a5
    16a8:	43fa 2bee      	lea %pc@(0x4298),%a1
    16ac:	2f49 0040      	movel %a1,%sp@(64)
    16b0:	6000 ed52      	braw 0x404
    16b4:	9443           	subw %d3,%d2
    16b6:	3142 0072      	movew %d2,%a0@(114)
    16ba:	317c ffff 0074 	movew #-1,%a0@(116)
    16c0:	6000 f6ac      	braw 0xd6e
    16c4:	9443           	subw %d3,%d2
    16c6:	3142 0072      	movew %d2,%a0@(114)
    16ca:	317c ffff 0074 	movew #-1,%a0@(116)
    16d0:	6000 f75a      	braw 0xe2c
    16d4:	1429 0008      	moveb %a1@(8),%d2
    16d8:	6f3e           	bles 0x1718
    16da:	5302           	subqb #1,%d2
    16dc:	1342 0008      	moveb %d2,%a1@(8)
    16e0:	6636           	bnes 0x1718
    16e2:	2429 005c      	movel %a1@(92),%d2
    16e6:	ec82           	asrl #6,%d2
    16e8:	2802           	movel %d2,%d4
    16ea:	0284 0000 ffff 	andil #65535,%d4
    16f0:	7610           	moveq #16,%d3
    16f2:	9684           	subl %d4,%d3
    16f4:	e283           	asrl #1,%d3
    16f6:	2829 0058      	movel %a1@(88),%d4
    16fa:	246f 002c      	moveal %sp@(44),%a2
    16fe:	1832 4800      	moveb %a2@(0,%d4:l),%d4
    1702:	d803           	addb %d3,%d4
    1704:	1344 0046      	moveb %d4,%a1@(70)
    1708:	3342 004a      	movew %d2,%a1@(74)
    170c:	337c 0010 0048 	movew #16,%a1@(72)
    1712:	7403           	moveq #3,%d2
    1714:	2342 0042      	movel %d2,%a1@(66)
    1718:	1429 0009      	moveb %a1@(9),%d2
    171c:	6700 037e      	beqw 0x1a9c
    1720:	1629 000a      	moveb %a1@(10),%d3
    1724:	6600 0370      	bnew 0x1a96
    1728:	4269 0014      	clrw %a1@(20)
    172c:	137c 0040 0006 	moveb #64,%a1@(6)
    1732:	4269 0012      	clrw %a1@(18)
    1736:	4229 000d      	clrb %a1@(13)
    173a:	4229 0009      	clrb %a1@(9)
    173e:	4269 000a      	clrw %a1@(10)
    1742:	50e9 0017      	st %a1@(23)
    1746:	4229 000e      	clrb %a1@(14)
    174a:	337c 0040 0020 	movew #64,%a1@(32)
    1750:	337c 0040 001a 	movew #64,%a1@(26)
    1756:	337c 00ff 001e 	movew #255,%a1@(30)
    175c:	4269 0022      	clrw %a1@(34)
    1760:	337c ffff 0024 	movew #-1,%a1@(36)
    1766:	4229 0028      	clrb %a1@(40)
    176a:	4269 002a      	clrw %a1@(42)
    176e:	4269 0030      	clrw %a1@(48)
    1772:	4269 0032      	clrw %a1@(50)
    1776:	337c 0010 002c 	movew #16,%a1@(44)
    177c:	4229 006a      	clrb %a1@(106)
    1780:	4229 006c      	clrb %a1@(108)
    1784:	137c 0001 006b 	moveb #1,%a1@(107)
    178a:	246b 09fe      	moveal %a3@(2558),%a2
    178e:	7600           	moveq #0,%d3
    1790:	1602           	moveb %d2,%d3
    1792:	0683 1fff ffff 	addil #536870911,%d3
    1798:	e78b           	lsll #3,%d3
    179a:	d6aa 011c      	addl %a2@(284),%d3
    179e:	2343 003a      	movel %d3,%a1@(58)
    17a2:	4243           	clrw %d3
    17a4:	1602           	moveb %d2,%d3
    17a6:	3343 001c      	movew %d3,%a1@(28)
    17aa:	1342 000c      	moveb %d2,%a1@(12)
    17ae:	1829 0010      	moveb %a1@(16),%d4
    17b2:	6b00 027e      	bmiw 0x1a32
    17b6:	6712           	beqs 0x17ca
    17b8:	1404           	moveb %d4,%d2
    17ba:	5302           	subqb #1,%d2
    17bc:	0c04 0001      	cmpib #1,%d4
    17c0:	6600 0420      	bnew 0x1be2
    17c4:	50e9 0010      	st %a1@(16)
    17c8:	50c4           	st %d4
    17ca:	7400           	moveq #0,%d2
    17cc:	342e 010e      	movew %fp@(270),%d2
    17d0:	d482           	addl %d2,%d2
    17d2:	d482           	addl %d2,%d2
    17d4:	d487           	addl %d7,%d2
    17d6:	d482           	addl %d2,%d2
    17d8:	246e 0114      	moveal %fp@(276),%a2
    17dc:	d5c2           	addal %d2,%a2
    17de:	b4fc 0000      	cmpaw #0,%a2
    17e2:	6700 024e      	beqw 0x1a32
    17e6:	142b 09f8      	moveb %a3@(2552),%d2
    17ea:	b42e 0001      	cmpb %fp@(1),%d2
    17ee:	6400 0242      	bccw 0x1a32
    17f2:	1a12           	moveb %a2@,%d5
    17f4:	7600           	moveq #0,%d3
    17f6:	1605           	moveb %d5,%d3
    17f8:	6700 0238      	beqw 0x1a32
    17fc:	7a48           	moveq #72,%d5
    17fe:	d685           	addl %d5,%d3
    1800:	d683           	addl %d3,%d3
    1802:	d683           	addl %d3,%d3
    1804:	0282 0000 00ff 	andil #255,%d2
    180a:	d482           	addl %d2,%d2
    180c:	2a6f 0030      	moveal %sp@(48),%a5
    1810:	3435 2800      	movew %a5@(0,%d2:l),%d2
    1814:	0282 0000 ffff 	andil #65535,%d2
    181a:	2a76 3800      	moveal %fp@(0,%d3:l),%a5
    181e:	dbc2           	addal %d2,%a5
    1820:	bafc 0000      	cmpaw #0,%a5
    1824:	6700 020c      	beqw 0x1a32
    1828:	142d 0001      	moveb %a5@(1),%d2
    182c:	0202 000f      	andib #15,%d2
    1830:	0c02 000e      	cmpib #14,%d2
    1834:	6624           	bnes 0x185a
    1836:	4a04           	tstb %d4
    1838:	6620           	bnes 0x185a
    183a:	162d 0002      	moveb %a5@(2),%d3
    183e:	e80b           	lsrb #4,%d3
    1840:	142d 0002      	moveb %a5@(2),%d2
    1844:	0202 000f      	andib #15,%d2
    1848:	0c03 000d      	cmpib #13,%d3
    184c:	6700 038c      	beqw 0x1bda
    1850:	0c03 000a      	cmpib #10,%d3
    1854:	6604           	bnes 0x185a
    1856:	1342 000f      	moveb %d2,%a1@(15)
    185a:	50e9 0010      	st %a1@(16)
    185e:	1f6a 0001 0034 	moveb %a2@(1),%sp@(52)
    1864:	1c15           	moveb %a5@,%d6
    1866:	1f6d 0001 002b 	moveb %a5@(1),%sp@(43)
    186c:	142d 0002      	moveb %a5@(2),%d2
    1870:	1606           	moveb %d6,%d3
    1872:	ee0b           	lsrb #7,%d3
    1874:	e90b           	lslb #4,%d3
    1876:	1a2f 002b      	moveb %sp@(43),%d5
    187a:	e80d           	lsrb #4,%d5
    187c:	d605           	addb %d5,%d3
    187e:	1a06           	moveb %d6,%d5
    1880:	0205 003f      	andib #63,%d5
    1884:	4a03           	tstb %d3
    1886:	672c           	beqs 0x18b4
    1888:	4a05           	tstb %d5
    188a:	6628           	bnes 0x18b4
    188c:	246b 09fe      	moveal %a3@(2558),%a2
    1890:	7800           	moveq #0,%d4
    1892:	1803           	moveb %d3,%d4
    1894:	2a44           	moveal %d4,%a5
    1896:	dbfc 1fff ffff 	addal #536870911,%a5
    189c:	280d           	movel %a5,%d4
    189e:	e78c           	lsll #3,%d4
    18a0:	2a44           	moveal %d4,%a5
    18a2:	dbea 011c      	addal %a2@(284),%a5
    18a6:	1369 0021 0006 	moveb %a1@(33),%a1@(6)
    18ac:	bbe9 003a      	cmpal %a1@(58),%a5
    18b0:	6700 04f6      	beqw 0x1da8
    18b4:	1806           	moveb %d6,%d4
    18b6:	0204 0040      	andib #64,%d4
    18ba:	3a44           	moveaw %d4,%a5
    18bc:	182f 002b      	moveb %sp@(43),%d4
    18c0:	0204 000f      	andib #15,%d4
    18c4:	0806 0006      	btst #6,%d6
    18c8:	6700 02e8      	beqw 0x1bb2
    18cc:	1c02           	moveb %d2,%d6
    18ce:	8c04           	orb %d4,%d6
    18d0:	3a46           	moveaw %d6,%a5
    18d2:	6716           	beqs 0x18ea
    18d4:	e14c           	lslw #8,%d4
    18d6:	1c02           	moveb %d2,%d6
    18d8:	e80e           	lsrb #4,%d6
    18da:	1806           	moveb %d6,%d4
    18dc:	3284           	movew %d4,%a1@
    18de:	1802           	moveb %d2,%d4
    18e0:	0204 000f      	andib #15,%d4
    18e4:	1344 0002      	moveb %d4,%a1@(2)
    18e8:	9bcd           	subal %a5,%a5
    18ea:	1f7c 0001 002b 	moveb #1,%sp@(43)
    18f0:	50c4           	st %d4
    18f2:	0c05 003d      	cmpib #61,%d5
    18f6:	6700 0344      	beqw 0x1c3c
    18fa:	4a03           	tstb %d3
    18fc:	6700 030a      	beqw 0x1c08
    1900:	4a05           	tstb %d5
    1902:	6700 00ca      	beqw 0x19ce
    1906:	0c04 0003      	cmpib #3,%d4
    190a:	6700 0458      	beqw 0x1d64
    190e:	4269 0014      	clrw %a1@(20)
    1912:	137c 0040 0006 	moveb #64,%a1@(6)
    1918:	4229 000d      	clrb %a1@(13)
    191c:	4229 0009      	clrb %a1@(9)
    1920:	4269 000a      	clrw %a1@(10)
    1924:	50e9 0017      	st %a1@(23)
    1928:	4229 000e      	clrb %a1@(14)
    192c:	337c 0040 0020 	movew #64,%a1@(32)
    1932:	337c 0040 001a 	movew #64,%a1@(26)
    1938:	337c 00ff 001e 	movew #255,%a1@(30)
    193e:	4269 0022      	clrw %a1@(34)
    1942:	337c ffff 0024 	movew #-1,%a1@(36)
    1948:	4229 0028      	clrb %a1@(40)
    194c:	4269 002a      	clrw %a1@(42)
    1950:	4269 002e      	clrw %a1@(46)
    1954:	4269 0030      	clrw %a1@(48)
    1958:	4269 0032      	clrw %a1@(50)
    195c:	337c 0010 002c 	movew #16,%a1@(44)
    1962:	4229 006a      	clrb %a1@(106)
    1966:	4229 006c      	clrb %a1@(108)
    196a:	137c 0001 006b 	moveb #1,%a1@(107)
    1970:	7c00           	moveq #0,%d6
    1972:	1c03           	moveb %d3,%d6
    1974:	0686 1fff ffff 	addil #536870911,%d6
    197a:	e78e           	lsll #3,%d6
    197c:	246b 09fe      	moveal %a3@(2558),%a2
    1980:	dcaa 011c      	addl %a2@(284),%d6
    1984:	2346 003a      	movel %d6,%a1@(58)
    1988:	3c03           	movew %d3,%d6
    198a:	0246 003f      	andiw #63,%d6
    198e:	3346 001c      	movew %d6,%a1@(28)
    1992:	1343 000c      	moveb %d3,%a1@(12)
    1996:	0285 0000 00ff 	andil #255,%d5
    199c:	162f 0034      	moveb %sp@(52),%d3
    19a0:	4883           	extw %d3
    19a2:	2445           	moveal %d5,%a2
    19a4:	3c03           	movew %d3,%d6
    19a6:	48c6           	extl %d6
    19a8:	45f2 6800      	lea %a2@(0,%d6:l),%a2
    19ac:	260a           	movel %a2,%d3
    19ae:	e98b           	lsll #4,%d3
    19b0:	4a2f 002b      	tstb %sp@(43)
    19b4:	660a           	bnes 0x19c0
    19b6:	4291           	clrl %a1@
    19b8:	0c04 0003      	cmpib #3,%d4
    19bc:	6700 03c8      	beqw 0x1d86
    19c0:	337c 0010 002c 	movew #16,%a1@(44)
    19c6:	3343 002e      	movew %d3,%a1@(46)
    19ca:	4269 0012      	clrw %a1@(18)
    19ce:	3a0d           	movew %a5,%d5
    19d0:	4a05           	tstb %d5
    19d2:	670c           	beqs 0x19e0
    19d4:	1345 0009      	moveb %d5,%a1@(9)
    19d8:	1602           	moveb %d2,%d3
    19da:	e80b           	lsrb #4,%d3
    19dc:	1343 000a      	moveb %d3,%a1@(10)
    19e0:	4229 000b      	clrb %a1@(11)
    19e4:	4269 0014      	clrw %a1@(20)
    19e8:	4a2f 002b      	tstb %sp@(43)
    19ec:	6644           	bnes 0x1a32
    19ee:	0c04 000f      	cmpib #15,%d4
    19f2:	623e           	bhis 0x1a32
    19f4:	7600           	moveq #0,%d3
    19f6:	1604           	moveb %d4,%d3
    19f8:	d683           	addl %d3,%d3
    19fa:	246f 0038      	moveal %sp@(56),%a2
    19fe:	3632 3800      	movew %a2@(0,%d3:l),%d3
    1a02:	4efb 3002      	jmp %pc@(0x1a06,%d3:w)
    1a06:	002c 04b8 04a2 	orib #-72,%a4@(1186)
    1a0c:	002c 0460 0044 	orib #96,%a4@(68)
    1a12:	002c 002c 002c 	orib #44,%a4@(44)
    1a18:	0450 042c      	subiw #1068,%a0@
    1a1c:	041c 0020      	subib #32,%a4@+
    1a20:	040c           	.short 0x040c
    1a22:	002c 03d6 0c02 	orib #-42,%a4@(3074)
    1a28:	0040 6302      	oriw #25346,%d0
    1a2c:	7440           	moveq #64,%d2
    1a2e:	1342 0006      	moveb %d2,%a1@(6)
    1a32:	1629 0016      	moveb %a1@(22),%d3
    1a36:	4a03           	tstb %d3
    1a38:	6636           	bnes 0x1a70
    1a3a:	2e00           	movel %d0,%d7
    1a3c:	2241           	moveal %d1,%a1
    1a3e:	7003           	moveq #3,%d0
    1a40:	b087           	cmpl %d7,%d0
    1a42:	6c00 fb5a      	bgew 0x159e
    1a46:	6000 fb7c      	braw 0x15c4
    1a4a:	b3ef 0044      	cmpal %sp@(68),%a1
    1a4e:	67e2           	beqs 0x1a32
    1a50:	45e9 0306      	lea %a1@(774),%a2
    1a54:	2609           	movel %a1,%d3
    1a56:	0683 0000 0506 	addil #1286,%d3
    1a5c:	4212           	clrb %a2@
    1a5e:	45ea 0010      	lea %a2@(16),%a2
    1a62:	b5c3           	cmpal %d3,%a2
    1a64:	66f6           	bnes 0x1a5c
    1a66:	4a02           	tstb %d2
    1a68:	6600 0486      	bnew 0x1ef0
    1a6c:	50e9 0016      	st %a1@(22)
    1a70:	2400           	movel %d0,%d2
    1a72:	d480           	addl %d0,%d2
    1a74:	d482           	addl %d2,%d2
    1a76:	d480           	addl %d0,%d2
    1a78:	ed8a           	lsll #6,%d2
    1a7a:	9480           	subl %d0,%d2
    1a7c:	d482           	addl %d2,%d2
    1a7e:	4a33 280e      	tstb %a3@(e,%d2:l)
    1a82:	66b6           	bnes 0x1a3a
    1a84:	43e9 04fc      	lea %a1@(1276),%a1
    1a88:	5487           	addql #2,%d7
    1a8a:	7003           	moveq #3,%d0
    1a8c:	b087           	cmpl %d7,%d0
    1a8e:	6c00 fb0e      	bgew 0x159e
    1a92:	6000 fb30      	braw 0x15c4
    1a96:	5303           	subqb #1,%d3
    1a98:	1343 000a      	moveb %d3,%a1@(10)
    1a9c:	3629 0012      	movew %a1@(18),%d3
    1aa0:	6720           	beqs 0x1ac2
    1aa2:	3429 002e      	movew %a1@(46),%d2
    1aa6:	7800           	moveq #0,%d4
    1aa8:	3803           	movew %d3,%d4
    1aaa:	4245           	clrw %d5
    1aac:	1a29 0007      	moveb %a1@(7),%d5
    1ab0:	3442           	moveaw %d2,%a2
    1ab2:	b88a           	cmpl %a2,%d4
    1ab4:	6f2c           	bles 0x1ae2
    1ab6:	d445           	addw %d5,%d2
    1ab8:	3342 002e      	movew %d2,%a1@(46)
    1abc:	3442           	moveaw %d2,%a2
    1abe:	b5c4           	cmpal %d4,%a2
    1ac0:	6e2c           	bgts 0x1aee
    1ac2:	1429 000b      	moveb %a1@(11),%d2
    1ac6:	6700 fce6      	beqw 0x17ae
    1aca:	d429 0006      	addb %a1@(6),%d2
    1ace:	6b28           	bmis 0x1af8
    1ad0:	0c02 0040      	cmpib #64,%d2
    1ad4:	6f00 0214      	blew 0x1cea
    1ad8:	137c 0040 0006 	moveb #64,%a1@(6)
    1ade:	6000 fcce      	braw 0x17ae
    1ae2:	9445           	subw %d5,%d2
    1ae4:	3342 002e      	movew %d2,%a1@(46)
    1ae8:	3442           	moveaw %d2,%a2
    1aea:	b5c4           	cmpal %d4,%a2
    1aec:	6cd4           	bges 0x1ac2
    1aee:	3343 002e      	movew %d3,%a1@(46)
    1af2:	4269 0012      	clrw %a1@(18)
    1af6:	60ca           	bras 0x1ac2
    1af8:	4229 0006      	clrb %a1@(6)
    1afc:	6000 fcb0      	braw 0x17ae
    1b00:	23eb 0a64 00df 	movel %a3@(2660),0xdff0d0
    1b06:	f0d0 
    1b08:	33fc 0001 00df 	movew #1,0xdff0d4
    1b0e:	f0d4 
    1b10:	33eb 07f0 00df 	movew %a3@(2032),0xdff0d6
    1b16:	f0d6 
    1b18:	4240           	clrw %d0
    1b1a:	102b 07f2      	moveb %a3@(2034),%d0
    1b1e:	33c0 00df f0d8 	movew %d0,0xdff0d8
    1b24:	4cdf 6cfc      	moveml %sp@+,%d2-%d7/%a2-%a3/%a5-%fp
    1b28:	4fef 0028      	lea %sp@(40),%sp
    1b2c:	4e75           	rts
    1b2e:	23eb 0a64 00df 	movel %a3@(2660),0xdff0a0
    1b34:	f0a0 
    1b36:	33fc 0001 00df 	movew #1,0xdff0a4
    1b3c:	f0a4 
    1b3e:	33eb 0076 00df 	movew %a3@(118),0xdff0a6
    1b44:	f0a6 
    1b46:	4240           	clrw %d0
    1b48:	102b 0078      	moveb %a3@(120),%d0
    1b4c:	33c0 00df f0a8 	movew %d0,0xdff0a8
    1b52:	33fc 8002 00df 	movew #-32766,0xdff096
    1b58:	f096 
    1b5a:	302b 02f2      	movew %a3@(754),%d0
    1b5e:	0c40 ffff      	cmpiw #-1,%d0
    1b62:	6600 ed04      	bnew 0x868
    1b66:	23eb 0a64 00df 	movel %a3@(2660),0xdff0b0
    1b6c:	f0b0 
    1b6e:	33fc 0001 00df 	movew #1,0xdff0b4
    1b74:	f0b4 
    1b76:	33eb 02f4 00df 	movew %a3@(756),0xdff0b6
    1b7c:	f0b6 
    1b7e:	4240           	clrw %d0
    1b80:	102b 02f6      	moveb %a3@(758),%d0
    1b84:	33c0 00df f0b8 	movew %d0,0xdff0b8
    1b8a:	33fc 8004 00df 	movew #-32764,0xdff096
    1b90:	f096 
    1b92:	302b 0570      	movew %a3@(1392),%d0
    1b96:	0c40 ffff      	cmpiw #-1,%d0
    1b9a:	6600 ed04      	bnew 0x8a0
    1b9e:	23eb 0a64 00df 	movel %a3@(2660),0xdff0c0
    1ba4:	f0c0 
    1ba6:	33fc 0001 00df 	movew #1,0xdff0c4
    1bac:	f0c4 
    1bae:	6000 ed00      	braw 0x8b0
    1bb2:	4a04           	tstb %d4
    1bb4:	661c           	bnes 0x1bd2
    1bb6:	4a02           	tstb %d2
    1bb8:	6718           	beqs 0x1bd2
    1bba:	1c02           	moveb %d2,%d6
    1bbc:	0206 000f      	andib #15,%d6
    1bc0:	4a05           	tstb %d5
    1bc2:	6602           	bnes 0x1bc6
    1bc4:	7a01           	moveq #1,%d5
    1bc6:	422f 002b      	clrb %sp@(43)
    1bca:	3a43           	moveaw %d3,%a5
    1bcc:	1606           	moveb %d6,%d3
    1bce:	6000 fd22      	braw 0x18f2
    1bd2:	422f 002b      	clrb %sp@(43)
    1bd6:	6000 fd1a      	braw 0x18f2
    1bda:	4a2b 09fc      	tstb %a3@(2556)
    1bde:	6700 fc7a      	beqw 0x185a
    1be2:	1342 0010      	moveb %d2,%a1@(16)
    1be6:	2e00           	movel %d0,%d7
    1be8:	2241           	moveal %d1,%a1
    1bea:	7003           	moveq #3,%d0
    1bec:	b087           	cmpl %d7,%d0
    1bee:	6c00 f9ae      	bgew 0x159e
    1bf2:	6000 f9d0      	braw 0x15c4
    1bf6:	0601 0020      	addib #32,%d1
    1bfa:	1001           	moveb %d1,%d0
    1bfc:	4880           	extw %d0
    1bfe:	3240           	moveaw %d0,%a1
    1c00:	7807           	moveq #7,%d4
    1c02:	c284           	andl %d4,%d1
    1c04:	6000 f5ac      	braw 0x11b2
    1c08:	4a05           	tstb %d5
    1c0a:	6700 fdc2      	beqw 0x19ce
    1c0e:	162f 0034      	moveb %sp@(52),%d3
    1c12:	4883           	extw %d3
    1c14:	0285 0000 00ff 	andil #255,%d5
    1c1a:	2445           	moveal %d5,%a2
    1c1c:	3c03           	movew %d3,%d6
    1c1e:	48c6           	extl %d6
    1c20:	45f2 6800      	lea %a2@(0,%d6:l),%a2
    1c24:	260a           	movel %a2,%d3
    1c26:	e98b           	lsll #4,%d3
    1c28:	4a2f 002b      	tstb %sp@(43)
    1c2c:	6700 fd88      	beqw 0x19b6
    1c30:	0c04 0003      	cmpib #3,%d4
    1c34:	6600 fd8a      	bnew 0x19c0
    1c38:	6000 014c      	braw 0x1d86
    1c3c:	2629 005c      	movel %a1@(92),%d3
    1c40:	ec83           	asrl #6,%d3
    1c42:	2c03           	movel %d3,%d6
    1c44:	0286 0000 ffff 	andil #65535,%d6
    1c4a:	7a10           	moveq #16,%d5
    1c4c:	9a86           	subl %d6,%d5
    1c4e:	e285           	asrl #1,%d5
    1c50:	2c29 0058      	movel %a1@(88),%d6
    1c54:	246f 002c      	moveal %sp@(44),%a2
    1c58:	1c32 6800      	moveb %a2@(0,%d6:l),%d6
    1c5c:	dc05           	addb %d5,%d6
    1c5e:	1346 0046      	moveb %d6,%a1@(70)
    1c62:	3343 004a      	movew %d3,%a1@(74)
    1c66:	337c 0010 0048 	movew #16,%a1@(72)
    1c6c:	7603           	moveq #3,%d3
    1c6e:	2343 0042      	movel %d3,%a1@(66)
    1c72:	6000 fd5a      	braw 0x19ce
    1c76:	142b 09fb      	moveb %a3@(2555),%d2
    1c7a:	6a00 f9b2      	bplw 0x162e
    1c7e:	102b 09f8      	moveb %a3@(2552),%d0
    1c82:	7400           	moveq #0,%d2
    1c84:	1400           	moveb %d0,%d2
    1c86:	b282           	cmpl %d2,%d1
    1c88:	6f00 00c0      	blew 0x1d4a
    1c8c:	5282           	addql #1,%d2
    1c8e:	226b 09fe      	moveal %a3@(2558),%a1
    1c92:	7200           	moveq #0,%d1
    1c94:	1229 0001      	moveb %a1@(1),%d1
    1c98:	b282           	cmpl %d2,%d1
    1c9a:	6f00 024a      	blew 0x1ee6
    1c9e:	5200           	addqb #1,%d0
    1ca0:	1740 09f8      	moveb %d0,%a3@(2552)
    1ca4:	122b 09fc      	moveb %a3@(2556),%d1
    1ca8:	0c01 002f      	cmpib #47,%d1
    1cac:	6300 f9d8      	blsw 0x1686
    1cb0:	0800 0000      	btst #0,%d0
    1cb4:	6700 00a4      	beqw 0x1d5a
    1cb8:	0201 000f      	andib #15,%d1
    1cbc:	1741 09fd      	moveb %d1,%a3@(2557)
    1cc0:	42af 002c      	clrl %sp@(44)
    1cc4:	43fa 281a      	lea %pc@(0x44e0),%a1
    1cc8:	2f49 0034      	movel %a1,%sp@(52)
    1ccc:	702a           	moveq #42,%d0
    1cce:	c0fc 0000      	muluw #0,%d0
    1cd2:	2f40 003c      	movel %d0,%sp@(60)
    1cd6:	4dfa 2c8c      	lea %pc@(0x4964),%fp
    1cda:	4bfa ee6a      	lea %pc@(0xb46),%a5
    1cde:	43fa 25b8      	lea %pc@(0x4298),%a1
    1ce2:	2f49 0040      	movel %a1,%sp@(64)
    1ce6:	6000 e71c      	braw 0x404
    1cea:	1342 0006      	moveb %d2,%a1@(6)
    1cee:	6000 fabe      	braw 0x17ae
    1cf2:	50eb 09fb      	st %a3@(2555)
    1cf6:	0c03 0001      	cmpib #1,%d3
    1cfa:	6200 f97e      	bhiw 0x167a
    1cfe:	422b 09f8      	clrb %a3@(2552)
    1d02:	4a00           	tstb %d0
    1d04:	6700 f956      	beqw 0x165c
    1d08:	122b 09fc      	moveb %a3@(2556),%d1
    1d0c:	0c01 002f      	cmpib #47,%d1
    1d10:	6300 f974      	blsw 0x1686
    1d14:	6044           	bras 0x1d5a
    1d16:	1003           	moveb %d3,%d0
    1d18:	5300           	subqb #1,%d0
    1d1a:	1740 09f8      	moveb %d0,%a3@(2552)
    1d1e:	342e 010e      	movew %fp@(270),%d2
    1d22:	5242           	addqw #1,%d2
    1d24:	3d42 010e      	movew %d2,%fp@(270)
    1d28:	326e 0110      	moveaw %fp@(272),%a1
    1d2c:	6a00 f8ea      	bplw 0x1618
    1d30:	d449           	addw %a1,%d2
    1d32:	3d42 010e      	movew %d2,%fp@(270)
    1d36:	b449           	cmpw %a1,%d2
    1d38:	6d00 f8e8      	bltw 0x1622
    1d3c:	6000 f8de      	braw 0x161c
    1d40:	7400           	moveq #0,%d2
    1d42:	1400           	moveb %d0,%d2
    1d44:	b282           	cmpl %d2,%d1
    1d46:	6e00 ff5c      	bgtw 0x1ca4
    1d4a:	102b 1c74      	moveb %a3@(7284),%d0
    1d4e:	422b 09f8      	clrb %a3@(2552)
    1d52:	4a00           	tstb %d0
    1d54:	66b2           	bnes 0x1d08
    1d56:	6000 f904      	braw 0x165c
    1d5a:	e809           	lsrb #4,%d1
    1d5c:	1741 09fd      	moveb %d1,%a3@(2557)
    1d60:	6000 f928      	braw 0x168a
    1d64:	0285 0000 00ff 	andil #255,%d5
    1d6a:	162f 0034      	moveb %sp@(52),%d3
    1d6e:	4883           	extw %d3
    1d70:	2445           	moveal %d5,%a2
    1d72:	3c03           	movew %d3,%d6
    1d74:	48c6           	extl %d6
    1d76:	45f2 6800      	lea %a2@(0,%d6:l),%a2
    1d7a:	260a           	movel %a2,%d3
    1d7c:	e98b           	lsll #4,%d3
    1d7e:	4a2f 002b      	tstb %sp@(43)
    1d82:	6700 fc32      	beqw 0x19b6
    1d86:	0643 0010      	addiw #16,%d3
    1d8a:	3343 0012      	movew %d3,%a1@(18)
    1d8e:	3629 002c      	movew %a1@(44),%d3
    1d92:	d769 002e      	addw %d3,%a1@(46)
    1d96:	4269 002c      	clrw %a1@(44)
    1d9a:	4a02           	tstb %d2
    1d9c:	6700 fc30      	beqw 0x19ce
    1da0:	1342 0007      	moveb %d2,%a1@(7)
    1da4:	6000 fc28      	braw 0x19ce
    1da8:	42a9 0042      	clrl %a1@(66)
    1dac:	42a9 005c      	clrl %a1@(92)
    1db0:	137c 0001 0060 	moveb #1,%a1@(96)
    1db6:	1806           	moveb %d6,%d4
    1db8:	0204 0040      	andib #64,%d4
    1dbc:	3a44           	moveaw %d4,%a5
    1dbe:	182f 002b      	moveb %sp@(43),%d4
    1dc2:	0204 000f      	andib #15,%d4
    1dc6:	0806 0006      	btst #6,%d6
    1dca:	6700 fde6      	beqw 0x1bb2
    1dce:	6000 fafc      	braw 0x18cc
    1dd2:	d041           	addw %d1,%d0
    1dd4:	3d40 010e      	movew %d0,%fp@(270)
    1dd8:	6000 f896      	braw 0x1670
    1ddc:	1742 09fc      	moveb %d2,%a3@(2556)
    1de0:	1602           	moveb %d2,%d3
    1de2:	0c02 002f      	cmpib #47,%d2
    1de6:	630e           	blss 0x1df6
    1de8:	082b 0000 09f8 	btst #0,%a3@(2552)
    1dee:	6700 0126      	beqw 0x1f16
    1df2:	0203 000f      	andib #15,%d3
    1df6:	1743 09fd      	moveb %d3,%a3@(2557)
    1dfa:	4a02           	tstb %d2
    1dfc:	56c2           	sne %d2
    1dfe:	4402           	negb %d2
    1e00:	1742 0a02      	moveb %d2,%a3@(2562)
    1e04:	1629 0016      	moveb %a1@(22),%d3
    1e08:	4a03           	tstb %d3
    1e0a:	6700 fc2e      	beqw 0x1a3a
    1e0e:	6000 fc60      	braw 0x1a70
    1e12:	1742 09fa      	moveb %d2,%a3@(2554)
    1e16:	1629 0016      	moveb %a1@(22),%d3
    1e1a:	6700 fc1e      	beqw 0x1a3a
    1e1e:	6000 fc50      	braw 0x1a70
    1e22:	1742 09fb      	moveb %d2,%a3@(2555)
    1e26:	1629 0016      	moveb %a1@(22),%d3
    1e2a:	6700 fc0e      	beqw 0x1a3a
    1e2e:	6000 fc40      	braw 0x1a70
    1e32:	1629 0016      	moveb %a1@(22),%d3
    1e36:	4a02           	tstb %d2
    1e38:	6700 fbfc      	beqw 0x1a36
    1e3c:	1802           	moveb %d2,%d4
    1e3e:	0204 000f      	andib #15,%d4
    1e42:	6700 00c8      	beqw 0x1f0c
    1e46:	4402           	negb %d2
    1e48:	1342 000b      	moveb %d2,%a1@(11)
    1e4c:	4a03           	tstb %d3
    1e4e:	6700 fbea      	beqw 0x1a3a
    1e52:	6000 fc1c      	braw 0x1a70
    1e56:	1342 000d      	moveb %d2,%a1@(13)
    1e5a:	1629 0016      	moveb %a1@(22),%d3
    1e5e:	6700 fbda      	beqw 0x1a3a
    1e62:	6000 fc0c      	braw 0x1a70
    1e66:	4269 0062      	clrw %a1@(98)
    1e6a:	337c 0001 0068 	movew #1,%a1@(104)
    1e70:	760f           	moveq #15,%d3
    1e72:	c682           	andl %d2,%d3
    1e74:	2a6f 003c      	moveal %sp@(60),%a5
    1e78:	1635 3800      	moveb %a5@(0,%d3:l),%d3
    1e7c:	0243 00ff      	andiw #255,%d3
    1e80:	3343 0064      	movew %d3,%a1@(100)
    1e84:	e80a           	lsrb #4,%d2
    1e86:	0282 0000 00ff 	andil #255,%d2
    1e8c:	246f 0040      	moveal %sp@(64),%a2
    1e90:	1432 2800      	moveb %a2@(0,%d2:l),%d2
    1e94:	0242 00ff      	andiw #255,%d2
    1e98:	3342 0066      	movew %d2,%a1@(102)
    1e9c:	1629 0016      	moveb %a1@(22),%d3
    1ea0:	6700 fb98      	beqw 0x1a3a
    1ea4:	6000 fbca      	braw 0x1a70
    1ea8:	0242 00ff      	andiw #255,%d2
    1eac:	4442           	negw %d2
    1eae:	3342 0014      	movew %d2,%a1@(20)
    1eb2:	1629 0016      	moveb %a1@(22),%d3
    1eb6:	6700 fb82      	beqw 0x1a3a
    1eba:	6000 fbb4      	braw 0x1a70
    1ebe:	0242 00ff      	andiw #255,%d2
    1ec2:	3342 0014      	movew %d2,%a1@(20)
    1ec6:	1629 0016      	moveb %a1@(22),%d3
    1eca:	6700 fb6e      	beqw 0x1a3a
    1ece:	6000 fba0      	braw 0x1a70
    1ed2:	50eb 09fb      	st %a3@(2555)
    1ed6:	0c03 0001      	cmpib #1,%d3
    1eda:	6200 f79e      	bhiw 0x167a
    1ede:	422b 09f8      	clrb %a3@(2552)
    1ee2:	6000 f778      	braw 0x165c
    1ee6:	4200           	clrb %d0
    1ee8:	1740 09f8      	moveb %d0,%a3@(2552)
    1eec:	6000 fdb6      	braw 0x1ca4
    1ef0:	1602           	moveb %d2,%d3
    1ef2:	0203 000f      	andib #15,%d3
    1ef6:	d603           	addb %d3,%d3
    1ef8:	1343 0016      	moveb %d3,%a1@(22)
    1efc:	e80a           	lsrb #4,%d2
    1efe:	1342 0018      	moveb %d2,%a1@(24)
    1f02:	4a03           	tstb %d3
    1f04:	6700 fb34      	beqw 0x1a3a
    1f08:	6000 fb66      	braw 0x1a70
    1f0c:	e80a           	lsrb #4,%d2
    1f0e:	1342 000b      	moveb %d2,%a1@(11)
    1f12:	6000 ff38      	braw 0x1e4c
    1f16:	e80b           	lsrb #4,%d3
    1f18:	1743 09fd      	moveb %d3,%a3@(2557)
    1f1c:	4a02           	tstb %d2
    1f1e:	56c2           	sne %d2
    1f20:	4402           	negb %d2
    1f22:	1742 0a02      	moveb %d2,%a3@(2562)
    1f26:	1629 0016      	moveb %a1@(22),%d3
    1f2a:	6000 fedc      	braw 0x1e08
    1f2e:	2628 004c      	movel %a0@(76),%d3
    1f32:	6000 f052      	braw 0xf86
    1f36:	48e7 3020      	moveml %d2-%d3/%a2,%sp@-
    1f3a:	246f 0010      	moveal %sp@(16),%a2
    1f3e:	222f 0014      	movel %sp@(20),%d1
    1f42:	357c 060f 09fc 	movew #1551,%a2@(2556)
    1f48:	226a 09fe      	moveal %a2@(2558),%a1
    1f4c:	422a 09f8      	clrb %a2@(2552)
    1f50:	7600           	moveq #0,%d3
    1f52:	1601           	moveb %d1,%d3
    1f54:	4240           	clrw %d0
    1f56:	1001           	moveb %d1,%d0
    1f58:	6700 01d4      	beqw 0x212e
    1f5c:	41e9 053f      	lea %a1@(1343),%a0
    1f60:	5340           	subqw #1,%d0
    1f62:	7400           	moveq #0,%d2
    1f64:	3400           	movew %d0,%d2
    1f66:	e78a           	lsll #3,%d2
    1f68:	2009           	movel %a1,%d0
    1f6a:	0680 0000 0547 	addil #1351,%d0
    1f70:	d480           	addl %d0,%d2
    1f72:	7200           	moveq #0,%d1
    1f74:	7000           	moveq #0,%d0
    1f76:	1010           	moveb %a0@,%d0
    1f78:	e788           	lsll #3,%d0
    1f7a:	d280           	addl %d0,%d1
    1f7c:	5088           	addql #8,%a0
    1f7e:	b488           	cmpl %a0,%d2
    1f80:	66f2           	bnes 0x1f74
    1f82:	2003           	movel %d3,%d0
    1f84:	e788           	lsll #3,%d0
    1f86:	41f1 0800      	lea %a1@(0,%d0:l),%a0
    1f8a:	1028 053c      	moveb %a0@(1340),%d0
    1f8e:	4242           	clrw %d2
    1f90:	1428 053f      	moveb %a0@(1343),%d2
    1f94:	3342 0110      	movew %d2,%a1@(272)
    1f98:	d2a9 0118      	addl %a1@(280),%d1
    1f9c:	2341 0114      	movel %d1,%a1@(276)
    1fa0:	4269 010e      	clrw %a1@(270)
    1fa4:	0240 00ff      	andiw #255,%d0
    1fa8:	3340 0112      	movew %d0,%a1@(274)
    1fac:	1428 053e      	moveb %a0@(1342),%d2
    1fb0:	1342 0001      	moveb %d2,%a1@(1)
    1fb4:	4240           	clrw %d0
    1fb6:	1002           	moveb %d2,%d0
    1fb8:	3340 0004      	movew %d0,%a1@(4)
    1fbc:	0683 0000 00a8 	addil #168,%d3
    1fc2:	e78b           	lsll #3,%d3
    1fc4:	2029 000a      	movel %a1@(10),%d0
    1fc8:	d0b1 3800      	addl %a1@(0,%d3:l),%d0
    1fcc:	2340 0006      	movel %d0,%a1@(6)
    1fd0:	0282 0000 00ff 	andil #255,%d2
    1fd6:	c4fc 0003      	muluw #3,%d2
    1fda:	0282 0000 ffff 	andil #65535,%d2
    1fe0:	41e9 0124      	lea %a1@(292),%a0
    1fe4:	2209           	movel %a1,%d1
    1fe6:	0681 0000 0520 	addil #1312,%d1
    1fec:	20c0           	movel %d0,%a0@+
    1fee:	d082           	addl %d2,%d0
    1ff0:	b288           	cmpl %a0,%d1
    1ff2:	66f8           	bnes 0x1fec
    1ff4:	157c 0040 09f9 	moveb #64,%a2@(2553)
    1ffa:	202a 0a64      	movel %a2@(2660),%d0
    1ffe:	2540 006e      	movel %d0,%a2@(110)
    2002:	357c 0002 0072 	movew #2,%a2@(114)
    2008:	422a 0078      	clrb %a2@(120)
    200c:	357c 007b 0076 	movew #123,%a2@(118)
    2012:	157c 0040 0006 	moveb #64,%a2@(6)
    2018:	422a 0009      	clrb %a2@(9)
    201c:	426a 000a      	clrw %a2@(10)
    2020:	426a 000c      	clrw %a2@(12)
    2024:	422a 000e      	clrb %a2@(14)
    2028:	4292           	clrl %a2@
    202a:	42aa 005c      	clrl %a2@(92)
    202e:	7203           	moveq #3,%d1
    2030:	2541 0042      	movel %d1,%a2@(66)
    2034:	426a 0012      	clrw %a2@(18)
    2038:	426a 0014      	clrw %a2@(20)
    203c:	357c 00ff 0016 	movew #255,%a2@(22)
    2042:	422a 0010      	clrb %a2@(16)
    2046:	2540 02ec      	movel %d0,%a2@(748)
    204a:	357c 0002 02f0 	movew #2,%a2@(752)
    2050:	422a 02f6      	clrb %a2@(758)
    2054:	357c 007b 02f4 	movew #123,%a2@(756)
    205a:	157c 0040 0284 	moveb #64,%a2@(644)
    2060:	422a 0287      	clrb %a2@(647)
    2064:	426a 0288      	clrw %a2@(648)
    2068:	426a 028a      	clrw %a2@(650)
    206c:	422a 028c      	clrb %a2@(652)
    2070:	42aa 027e      	clrl %a2@(638)
    2074:	42aa 02da      	clrl %a2@(730)
    2078:	2541 02c0      	movel %d1,%a2@(704)
    207c:	426a 0290      	clrw %a2@(656)
    2080:	426a 0292      	clrw %a2@(658)
    2084:	357c 00ff 0294 	movew #255,%a2@(660)
    208a:	422a 028e      	clrb %a2@(654)
    208e:	2540 056a      	movel %d0,%a2@(1386)
    2092:	357c 0002 056e 	movew #2,%a2@(1390)
    2098:	422a 0574      	clrb %a2@(1396)
    209c:	357c 007b 0572 	movew #123,%a2@(1394)
    20a2:	157c 0040 0502 	moveb #64,%a2@(1282)
    20a8:	422a 0505      	clrb %a2@(1285)
    20ac:	426a 0506      	clrw %a2@(1286)
    20b0:	426a 0508      	clrw %a2@(1288)
    20b4:	422a 050a      	clrb %a2@(1290)
    20b8:	42aa 04fc      	clrl %a2@(1276)
    20bc:	42aa 0558      	clrl %a2@(1368)
    20c0:	2541 053e      	movel %d1,%a2@(1342)
    20c4:	426a 050e      	clrw %a2@(1294)
    20c8:	426a 0510      	clrw %a2@(1296)
    20cc:	357c 00ff 0512 	movew #255,%a2@(1298)
    20d2:	422a 050c      	clrb %a2@(1292)
    20d6:	2540 07e8      	movel %d0,%a2@(2024)
    20da:	357c 0002 07ec 	movew #2,%a2@(2028)
    20e0:	422a 07f2      	clrb %a2@(2034)
    20e4:	357c 007b 07f0 	movew #123,%a2@(2032)
    20ea:	426a 078e      	clrw %a2@(1934)
    20ee:	157c 0040 0780 	moveb #64,%a2@(1920)
    20f4:	426a 078c      	clrw %a2@(1932)
    20f8:	422a 0785      	clrb %a2@(1925)
    20fc:	422a 0783      	clrb %a2@(1923)
    2100:	422a 0784      	clrb %a2@(1924)
    2104:	426a 0786      	clrw %a2@(1926)
    2108:	422a 0788      	clrb %a2@(1928)
    210c:	42aa 077a      	clrl %a2@(1914)
    2110:	42aa 07d6      	clrl %a2@(2006)
    2114:	2541 07bc      	movel %d1,%a2@(1980)
    2118:	357c 00ff 0790 	movew #255,%a2@(1936)
    211e:	422a 078a      	clrb %a2@(1930)
    2122:	157c 0001 0a02 	moveb #1,%a2@(2562)
    2128:	4cdf 040c      	moveml %sp@+,%d2-%d3/%a2
    212c:	4e75           	rts
    212e:	7200           	moveq #0,%d1
    2130:	2003           	movel %d3,%d0
    2132:	e788           	lsll #3,%d0
    2134:	41f1 0800      	lea %a1@(0,%d0:l),%a0
    2138:	1028 053c      	moveb %a0@(1340),%d0
    213c:	4242           	clrw %d2
    213e:	1428 053f      	moveb %a0@(1343),%d2
    2142:	3342 0110      	movew %d2,%a1@(272)
    2146:	d2a9 0118      	addl %a1@(280),%d1
    214a:	2341 0114      	movel %d1,%a1@(276)
    214e:	4269 010e      	clrw %a1@(270)
    2152:	0240 00ff      	andiw #255,%d0
    2156:	3340 0112      	movew %d0,%a1@(274)
    215a:	1428 053e      	moveb %a0@(1342),%d2
    215e:	1342 0001      	moveb %d2,%a1@(1)
    2162:	4240           	clrw %d0
    2164:	1002           	moveb %d2,%d0
    2166:	3340 0004      	movew %d0,%a1@(4)
    216a:	0683 0000 00a8 	addil #168,%d3
    2170:	e78b           	lsll #3,%d3
    2172:	2029 000a      	movel %a1@(10),%d0
    2176:	d0b1 3800      	addl %a1@(0,%d3:l),%d0
    217a:	2340 0006      	movel %d0,%a1@(6)
    217e:	0282 0000 00ff 	andil #255,%d2
    2184:	c4fc 0003      	muluw #3,%d2
    2188:	0282 0000 ffff 	andil #65535,%d2
    218e:	41e9 0124      	lea %a1@(292),%a0
    2192:	2209           	movel %a1,%d1
    2194:	0681 0000 0520 	addil #1312,%d1
    219a:	6000 fe50      	braw 0x1fec
    219e:	7000           	moveq #0,%d0
    21a0:	102f 000b      	moveb %sp@(11),%d0
    21a4:	2f40 0008      	movel %d0,%sp@(8)
    21a8:	43fa fd8c      	lea %pc@(0x1f36),%a1
    21ac:	4ed1           	jmp %a1@
    21ae:	4fef fff4      	lea %sp@(-12),%sp
    21b2:	48e7 3f36      	moveml %d2-%d7/%a2-%a3/%a5-%fp,%sp@-
    21b6:	266f 0038      	moveal %sp@(56),%a3
    21ba:	226f 003c      	moveal %sp@(60),%a1
    21be:	362f 0042      	movew %sp@(66),%d3
    21c2:	1a13           	moveb %a3@,%d5
    21c4:	102b 0003      	moveb %a3@(3),%d0
    21c8:	1200           	moveb %d0,%d1
    21ca:	0201 0007      	andib #7,%d1
    21ce:	1400           	moveb %d0,%d2
    21d0:	0202 0020      	andib #32,%d2
    21d4:	1f42 0031      	moveb %d2,%sp@(49)
    21d8:	3c00           	movew %d0,%d6
    21da:	0246 0007      	andiw #7,%d6
    21de:	3f46 0032      	movew %d6,%sp@(50)
    21e2:	4a01           	tstb %d1
    21e4:	6700 00b8      	beqw 0x229e
    21e8:	4bfa 206e      	lea %pc@(0x4258),%a5
    21ec:	7c00           	moveq #0,%d6
    21ee:	0245 00ff      	andiw #255,%d5
    21f2:	2006           	movel %d6,%d0
    21f4:	c1c5           	mulsw %d5,%d0
    21f6:	e080           	asrl #8,%d0
    21f8:	2f40 002c      	movel %d0,%sp@(44)
    21fc:	3206           	movew %d6,%d1
    21fe:	4242           	clrw %d2
    2200:	142b 0001      	moveb %a3@(1),%d2
    2204:	7000           	moveq #0,%d0
    2206:	301d           	movew %a5@+,%d0
    2208:	c0c2           	muluw %d2,%d0
    220a:	7400           	moveq #0,%d2
    220c:	142b 0002      	moveb %a3@(2),%d2
    2210:	4a2f 0031      	tstb %sp@(49)
    2214:	6600 00ae      	bnew 0x22c4
    2218:	e488           	lsrl #2,%d0
    221a:	ed8a           	lsll #6,%d2
    221c:	d480           	addl %d0,%d2
    221e:	4a43           	tstw %d3
    2220:	6772           	beqs 0x2294
    2222:	2806           	movel %d6,%d4
    2224:	5084           	addql #8,%d4
    2226:	91c8           	subal %a0,%a0
    2228:	7e00           	moveq #0,%d7
    222a:	45fa 1fec      	lea %pc@(0x4218),%a2
    222e:	0801 0000      	btst #0,%d1
    2232:	6600 0098      	bnew 0x22cc
    2236:	2f46 0028      	movel %d6,%sp@(40)
    223a:	de84           	addl %d4,%d7
    223c:	1031 8800      	moveb %a1@(0,%a0:l),%d0
    2240:	3207           	movew %d7,%d1
    2242:	7c0b           	moveq #11,%d6
    2244:	ec69           	lsrw %d6,%d1
    2246:	0281 0000 ffff 	andil #65535,%d1
    224c:	d281           	addl %d1,%d1
    224e:	3232 1800      	movew %a2@(0,%d1:l),%d1
    2252:	0281 0000 ffff 	andil #65535,%d1
    2258:	eb89           	lsll #5,%d1
    225a:	d282           	addl %d2,%d1
    225c:	ec89           	lsrl #6,%d1
    225e:	3c48           	moveaw %a0,%fp
    2260:	9cc1           	subaw %d1,%fp
    2262:	4241           	clrw %d1
    2264:	b24e           	cmpw %fp,%d1
    2266:	6e40           	bgts 0x22a8
    2268:	1231 e000      	moveb %a1@(0,%fp:w),%d1
    226c:	4881           	extw %d1
    226e:	48c1           	extl %d1
    2270:	c3c5           	mulsw %d5,%d1
    2272:	e081           	asrl #8,%d1
    2274:	4880           	extw %d0
    2276:	d041           	addw %d1,%d0
    2278:	0c40 0080      	cmpiw #128,%d0
    227c:	6c36           	bges 0x22b4
    227e:	0c40 ff7f      	cmpiw #-129,%d0
    2282:	6e02           	bgts 0x2286
    2284:	7080           	moveq #-128,%d0
    2286:	1380 8800      	moveb %d0,%a1@(0,%a0:l)
    228a:	5288           	addql #1,%a0
    228c:	b648           	cmpw %a0,%d3
    228e:	62aa           	bhis 0x223a
    2290:	2c2f 0028      	movel %sp@(40),%d6
    2294:	5286           	addql #1,%d6
    2296:	bc6f 0032      	cmpw %sp@(50),%d6
    229a:	6500 ff60      	bcsw 0x21fc
    229e:	4cdf 6cfc      	moveml %sp@+,%d2-%d7/%a2-%a3/%a5-%fp
    22a2:	4fef 000c      	lea %sp@(12),%sp
    22a6:	4e75           	rts
    22a8:	4880           	extw %d0
    22aa:	d06f 002e      	addw %sp@(46),%d0
    22ae:	0c40 0080      	cmpiw #128,%d0
    22b2:	6dca           	blts 0x227e
    22b4:	707f           	moveq #127,%d0
    22b6:	1380 8800      	moveb %d0,%a1@(0,%a0:l)
    22ba:	5288           	addql #1,%a0
    22bc:	b648           	cmpw %a0,%d3
    22be:	6200 ff7a      	bhiw 0x223a
    22c2:	60cc           	bras 0x2290
    22c4:	e18a           	lsll #8,%d2
    22c6:	d480           	addl %d0,%d2
    22c8:	6000 ff54      	braw 0x221e
    22cc:	2c46           	moveal %d6,%fp
    22ce:	de84           	addl %d4,%d7
    22d0:	1231 8800      	moveb %a1@(0,%a0:l),%d1
    22d4:	3007           	movew %d7,%d0
    22d6:	7c0b           	moveq #11,%d6
    22d8:	ec68           	lsrw %d6,%d0
    22da:	0280 0000 ffff 	andil #65535,%d0
    22e0:	d080           	addl %d0,%d0
    22e2:	3032 0800      	movew %a2@(0,%d0:l),%d0
    22e6:	0280 0000 ffff 	andil #65535,%d0
    22ec:	eb88           	lsll #5,%d0
    22ee:	d082           	addl %d2,%d0
    22f0:	ec88           	lsrl #6,%d0
    22f2:	3c08           	movew %a0,%d6
    22f4:	9c40           	subw %d0,%d6
    22f6:	6b48           	bmis 0x2340
    22f8:	1031 6000      	moveb %a1@(0,%d6:w),%d0
    22fc:	4880           	extw %d0
    22fe:	4440           	negw %d0
    2300:	48c0           	extl %d0
    2302:	c1c5           	mulsw %d5,%d0
    2304:	e080           	asrl #8,%d0
    2306:	4881           	extw %d1
    2308:	d240           	addw %d0,%d1
    230a:	0c41 0080      	cmpiw #128,%d1
    230e:	6d1c           	blts 0x232c
    2310:	727f           	moveq #127,%d1
    2312:	1381 8800      	moveb %d1,%a1@(0,%a0:l)
    2316:	5288           	addql #1,%a0
    2318:	b648           	cmpw %a0,%d3
    231a:	62b2           	bhis 0x22ce
    231c:	2c0e           	movel %fp,%d6
    231e:	5286           	addql #1,%d6
    2320:	bc6f 0032      	cmpw %sp@(50),%d6
    2324:	6500 fed6      	bcsw 0x21fc
    2328:	6000 ff74      	braw 0x229e
    232c:	0c41 ff7f      	cmpiw #-129,%d1
    2330:	6ee0           	bgts 0x2312
    2332:	7280           	moveq #-128,%d1
    2334:	1381 8800      	moveb %d1,%a1@(0,%a0:l)
    2338:	5288           	addql #1,%a0
    233a:	b648           	cmpw %a0,%d3
    233c:	6290           	bhis 0x22ce
    233e:	60dc           	bras 0x231c
    2340:	4240           	clrw %d0
    2342:	60ba           	bras 0x22fe
    2344:	48e7 3e00      	moveml %d2-%d6,%sp@-
    2348:	202f 0018      	movel %sp@(24),%d0
    234c:	222f 001c      	movel %sp@(28),%d1
    2350:	262f 0020      	movel %sp@(32),%d3
    2354:	2803           	movel %d3,%d4
    2356:	5384           	subql #1,%d4
    2358:	4a83           	tstl %d3
    235a:	675e           	beqs 0x23ba
    235c:	2041           	moveal %d1,%a0
    235e:	5288           	addql #1,%a0
    2360:	2400           	movel %d0,%d2
    2362:	9488           	subl %a0,%d2
    2364:	7a02           	moveq #2,%d5
    2366:	ba82           	cmpl %d2,%d5
    2368:	55c2           	scs %d2
    236a:	4402           	negb %d2
    236c:	7c06           	moveq #6,%d6
    236e:	bc84           	cmpl %d4,%d6
    2370:	55c5           	scs %d5
    2372:	4405           	negb %d5
    2374:	c405           	andb %d5,%d2
    2376:	6748           	beqs 0x23c0
    2378:	2400           	movel %d0,%d2
    237a:	8481           	orl %d1,%d2
    237c:	7a03           	moveq #3,%d5
    237e:	c485           	andl %d5,%d2
    2380:	663e           	bnes 0x23c0
    2382:	2041           	moveal %d1,%a0
    2384:	2240           	moveal %d0,%a1
    2386:	74fc           	moveq #-4,%d2
    2388:	c483           	andl %d3,%d2
    238a:	d481           	addl %d1,%d2
    238c:	22d8           	movel %a0@+,%a1@+
    238e:	b488           	cmpl %a0,%d2
    2390:	66fa           	bnes 0x238c
    2392:	74fc           	moveq #-4,%d2
    2394:	c483           	andl %d3,%d2
    2396:	2040           	moveal %d0,%a0
    2398:	d1c2           	addal %d2,%a0
    239a:	d282           	addl %d2,%d1
    239c:	9882           	subl %d2,%d4
    239e:	b483           	cmpl %d3,%d2
    23a0:	6718           	beqs 0x23ba
    23a2:	2241           	moveal %d1,%a1
    23a4:	1091           	moveb %a1@,%a0@
    23a6:	4a84           	tstl %d4
    23a8:	6710           	beqs 0x23ba
    23aa:	1169 0001 0001 	moveb %a1@(1),%a0@(1)
    23b0:	5384           	subql #1,%d4
    23b2:	6706           	beqs 0x23ba
    23b4:	1169 0002 0002 	moveb %a1@(2),%a0@(2)
    23ba:	4cdf 007c      	moveml %sp@+,%d2-%d6
    23be:	4e75           	rts
    23c0:	2240           	moveal %d0,%a1
    23c2:	d283           	addl %d3,%d1
    23c4:	12e8 ffff      	moveb %a0@(-1),%a1@+
    23c8:	b1c1           	cmpal %d1,%a0
    23ca:	67ee           	beqs 0x23ba
    23cc:	5288           	addql #1,%a0
    23ce:	60f4           	bras 0x23c4
    23d0:	518f           	subql #8,%sp
    23d2:	48e7 3f36      	moveml %d2-%d7/%a2-%a3/%a5-%fp,%sp@-
    23d6:	246f 0038      	moveal %sp@(56),%a2
    23da:	226f 003c      	moveal %sp@(60),%a1
    23de:	0c11 0050      	cmpib #80,%a1@
    23e2:	6608           	bnes 0x23ec
    23e4:	0c29 0052 0001 	cmpib #82,%a1@(1)
    23ea:	670a           	beqs 0x23f6
    23ec:	7000           	moveq #0,%d0
    23ee:	4cdf 6cfc      	moveml %sp@+,%d2-%d7/%a2-%a3/%a5-%fp
    23f2:	508f           	addql #8,%sp
    23f4:	4e75           	rts
    23f6:	0c29 0054 0002 	cmpib #84,%a1@(2)
    23fc:	66ee           	bnes 0x23ec
    23fe:	1e29 0003      	moveb %a1@(3),%d7
    2402:	0c07 001e      	cmpib #30,%d7
    2406:	62e4           	bhis 0x23ec
    2408:	7200           	moveq #0,%d1
    240a:	1229 0004      	moveb %a1@(4),%d1
    240e:	e149           	lslw #8,%d1
    2410:	4841           	swap %d1
    2412:	4241           	clrw %d1
    2414:	7000           	moveq #0,%d0
    2416:	1029 0005      	moveb %a1@(5),%d0
    241a:	4840           	swap %d0
    241c:	4240           	clrw %d0
    241e:	8081           	orl %d1,%d0
    2420:	7400           	moveq #0,%d2
    2422:	1429 0006      	moveb %a1@(6),%d2
    2426:	e18a           	lsll #8,%d2
    2428:	8480           	orl %d0,%d2
    242a:	8429 0007      	orb %a1@(7),%d2
    242e:	2a09           	movel %a1,%d5
    2430:	da82           	addl %d2,%d5
    2432:	1629 0041      	moveb %a1@(65),%d3
    2436:	0c07 001c      	cmpib #28,%d7
    243a:	6300 023a      	blsw 0x2676
    243e:	1229 005a      	moveb %a1@(90),%d1
    2442:	1541 0002      	moveb %d1,%a2@(2)
    2446:	4244           	clrw %d4
    2448:	4a01           	tstb %d1
    244a:	6732           	beqs 0x247e
    244c:	200a           	movel %a2,%d0
    244e:	0680 0000 053c 	addil #1340,%d0
    2454:	4244           	clrw %d4
    2456:	1801           	moveb %d1,%d4
    2458:	0281 0000 00ff 	andil #255,%d1
    245e:	e789           	lsll #3,%d1
    2460:	d285           	addl %d5,%d1
    2462:	2645           	moveal %d5,%a3
    2464:	2040           	moveal %d0,%a0
    2466:	10db           	moveb %a3@+,%a0@+
    2468:	10db           	moveb %a3@+,%a0@+
    246a:	10db           	moveb %a3@+,%a0@+
    246c:	10db           	moveb %a3@+,%a0@+
    246e:	10db           	moveb %a3@+,%a0@+
    2470:	10db           	moveb %a3@+,%a0@+
    2472:	10db           	moveb %a3@+,%a0@+
    2474:	1093           	moveb %a3@,%a0@
    2476:	5085           	addql #8,%d5
    2478:	5080           	addql #8,%d0
    247a:	b285           	cmpl %d5,%d1
    247c:	66e4           	bnes 0x2462
    247e:	1483           	moveb %d3,%a2@
    2480:	7a08           	moveq #8,%d5
    2482:	cac4           	muluw %d4,%d5
    2484:	da82           	addl %d2,%d5
    2486:	da89           	addl %a1,%d5
    2488:	1f6a 053c 002b 	moveb %a2@(1340),%sp@(43)
    248e:	1f6a 053f 002a 	moveb %a2@(1343),%sp@(42)
    2494:	142a 053e      	moveb %a2@(1342),%d2
    2498:	2f6a 0540 002c 	movel %a2@(1344),%sp@(44)
    249e:	2545 0118      	movel %d5,%a2@(280)
    24a2:	7000           	moveq #0,%d0
    24a4:	1029 0008      	moveb %a1@(8),%d0
    24a8:	e148           	lslw #8,%d0
    24aa:	4840           	swap %d0
    24ac:	4240           	clrw %d0
    24ae:	7200           	moveq #0,%d1
    24b0:	1229 0009      	moveb %a1@(9),%d1
    24b4:	4841           	swap %d1
    24b6:	4241           	clrw %d1
    24b8:	8280           	orl %d0,%d1
    24ba:	7000           	moveq #0,%d0
    24bc:	1029 000a      	moveb %a1@(10),%d0
    24c0:	e188           	lsll #8,%d0
    24c2:	8081           	orl %d1,%d0
    24c4:	8029 000b      	orb %a1@(11),%d0
    24c8:	4bf1 0800      	lea %a1@(0,%d0:l),%a5
    24cc:	254d 000a      	movel %a5,%a2@(10)
    24d0:	7000           	moveq #0,%d0
    24d2:	1029 000c      	moveb %a1@(12),%d0
    24d6:	e148           	lslw #8,%d0
    24d8:	4840           	swap %d0
    24da:	4240           	clrw %d0
    24dc:	7200           	moveq #0,%d1
    24de:	1229 000d      	moveb %a1@(13),%d1
    24e2:	4841           	swap %d1
    24e4:	4241           	clrw %d1
    24e6:	8280           	orl %d0,%d1
    24e8:	7000           	moveq #0,%d0
    24ea:	1029 000e      	moveb %a1@(14),%d0
    24ee:	e188           	lsll #8,%d0
    24f0:	8081           	orl %d1,%d0
    24f2:	8029 000f      	orb %a1@(15),%d0
    24f6:	47f1 0800      	lea %a1@(0,%d0:l),%a3
    24fa:	0c07 001e      	cmpib #30,%d7
    24fe:	6600 028c      	bnew 0x278c
    2502:	7840           	moveq #64,%d4
    2504:	254b 0520      	movel %a3,%a2@(1312)
    2508:	7200           	moveq #0,%d1
    250a:	4deb 0017      	lea %a3@(23),%fp
    250e:	204b           	moveal %a3,%a0
    2510:	4a1b           	tstb %a3@+
    2512:	6704           	beqs 0x2518
    2514:	bdcb           	cmpal %a3,%fp
    2516:	66f6           	bnes 0x250e
    2518:	5281           	addql #1,%d1
    251a:	b881           	cmpl %d1,%d4
    251c:	66ec           	bnes 0x250a
    251e:	254b 011c      	movel %a3,%a2@(284)
    2522:	1829 0040      	moveb %a1@(64),%d4
    2526:	7200           	moveq #0,%d1
    2528:	1204           	moveb %d4,%d1
    252a:	2001           	movel %d1,%d0
    252c:	e788           	lsll #3,%d0
    252e:	d08b           	addl %a3,%d0
    2530:	4a04           	tstb %d4
    2532:	6722           	beqs 0x2556
    2534:	47ea 000e      	lea %a2@(14),%a3
    2538:	5088           	addql #8,%a0
    253a:	d281           	addl %d1,%d1
    253c:	d281           	addl %d1,%d1
    253e:	2c01           	movel %d1,%d6
    2540:	dc8b           	addl %a3,%d6
    2542:	26c0           	movel %d0,%a3@+
    2544:	7800           	moveq #0,%d4
    2546:	1810           	moveb %a0@,%d4
    2548:	2204           	movel %d4,%d1
    254a:	d284           	addl %d4,%d1
    254c:	d284           	addl %d4,%d1
    254e:	d081           	addl %d1,%d0
    2550:	5088           	addql #8,%a0
    2552:	bc8b           	cmpl %a3,%d6
    2554:	66ec           	bnes 0x2542
    2556:	7000           	moveq #0,%d0
    2558:	1029 0010      	moveb %a1@(16),%d0
    255c:	e148           	lslw #8,%d0
    255e:	4840           	swap %d0
    2560:	4240           	clrw %d0
    2562:	7200           	moveq #0,%d1
    2564:	1229 0011      	moveb %a1@(17),%d1
    2568:	4841           	swap %d1
    256a:	4241           	clrw %d1
    256c:	8280           	orl %d0,%d1
    256e:	7000           	moveq #0,%d0
    2570:	1029 0012      	moveb %a1@(18),%d0
    2574:	e188           	lsll #8,%d0
    2576:	8081           	orl %d1,%d0
    2578:	8029 0013      	orb %a1@(19),%d0
    257c:	47f1 0800      	lea %a1@(0,%d0:l),%a3
    2580:	7218           	moveq #24,%d1
    2582:	41eb 0017      	lea %a3@(23),%a0
    2586:	200b           	movel %a3,%d0
    2588:	4a1b           	tstb %a3@+
    258a:	6704           	beqs 0x2590
    258c:	b1cb           	cmpal %a3,%a0
    258e:	66f6           	bnes 0x2586
    2590:	5381           	subql #1,%d1
    2592:	66ee           	bnes 0x2582
    2594:	220b           	movel %a3,%d1
    2596:	0801 0000      	btst #0,%d1
    259a:	6704           	beqs 0x25a0
    259c:	2640           	moveal %d0,%a3
    259e:	548b           	addql #2,%a3
    25a0:	254b 0120      	movel %a3,%a2@(288)
    25a4:	0c07 0019      	cmpib #25,%d7
    25a8:	6200 0180      	bhiw 0x272a
    25ac:	7000           	moveq #0,%d0
    25ae:	41ea 0524      	lea %a2@(1316),%a0
    25b2:	1180 0800      	moveb %d0,%a0@(0,%d0:l)
    25b6:	5280           	addql #1,%d0
    25b8:	7218           	moveq #24,%d1
    25ba:	b280           	cmpl %d0,%d1
    25bc:	66f4           	bnes 0x25b2
    25be:	4247           	clrw %d7
    25c0:	1e2f 002a      	moveb %sp@(42),%d7
    25c4:	3547 0110      	movew %d7,%a2@(272)
    25c8:	2545 0114      	movel %d5,%a2@(276)
    25cc:	426a 010e      	clrw %a2@(270)
    25d0:	4240           	clrw %d0
    25d2:	102f 002b      	moveb %sp@(43),%d0
    25d6:	3540 0112      	movew %d0,%a2@(274)
    25da:	1542 0001      	moveb %d2,%a2@(1)
    25de:	4240           	clrw %d0
    25e0:	1002           	moveb %d2,%d0
    25e2:	3540 0004      	movew %d0,%a2@(4)
    25e6:	202f 002c      	movel %sp@(44),%d0
    25ea:	d08d           	addl %a5,%d0
    25ec:	2540 0006      	movel %d0,%a2@(6)
    25f0:	7200           	moveq #0,%d1
    25f2:	1202           	moveb %d2,%d1
    25f4:	c2fc 0003      	muluw #3,%d1
    25f8:	0281 0000 ffff 	andil #65535,%d1
    25fe:	41ea 0124      	lea %a2@(292),%a0
    2602:	45ea 0520      	lea %a2@(1312),%a2
    2606:	20c0           	movel %d0,%a0@+
    2608:	d081           	addl %d1,%d0
    260a:	b1ca           	cmpal %a2,%a0
    260c:	66f8           	bnes 0x2606
    260e:	4a03           	tstb %d3
    2610:	6700 010e      	beqw 0x2720
    2614:	41eb 0014      	lea %a3@(20),%a0
    2618:	0243 00ff      	andiw #255,%d3
    261c:	c6fc 002a      	muluw #42,%d3
    2620:	45f3 3814      	lea %a3@(14,%d3:l),%a2
    2624:	7002           	moveq #2,%d0
    2626:	7200           	moveq #0,%d1
    2628:	1228 0005      	moveb %a0@(5),%d1
    262c:	5281           	addql #1,%d1
    262e:	ef89           	lsll #7,%d1
    2630:	0810 0002      	btst #2,%a0@
    2634:	672e           	beqs 0x2664
    2636:	2401           	movel %d1,%d2
    2638:	e48a           	lsrl #2,%d2
    263a:	2242           	moveal %d2,%a1
    263c:	2401           	movel %d1,%d2
    263e:	e28a           	lsrl #1,%d2
    2640:	d3c2           	addal %d2,%a1
    2642:	d3c1           	addal %d1,%a1
    2644:	e689           	lsrl #3,%d1
    2646:	d289           	addl %a1,%d1
    2648:	d081           	addl %d1,%d0
    264a:	41e8 002a      	lea %a0@(42),%a0
    264e:	b1ca           	cmpal %a2,%a0
    2650:	6700 fd9c      	beqw 0x23ee
    2654:	7200           	moveq #0,%d1
    2656:	1228 0005      	moveb %a0@(5),%d1
    265a:	5281           	addql #1,%d1
    265c:	ef89           	lsll #7,%d1
    265e:	0810 0002      	btst #2,%a0@
    2662:	66d2           	bnes 0x2636
    2664:	d081           	addl %d1,%d0
    2666:	41e8 002a      	lea %a0@(42),%a0
    266a:	b1ca           	cmpal %a2,%a0
    266c:	66b8           	bnes 0x2626
    266e:	4cdf 6cfc      	moveml %sp@+,%d2-%d7/%a2-%a3/%a5-%fp
    2672:	508f           	addql #8,%sp
    2674:	4e75           	rts
    2676:	157c 0001 0002 	moveb #1,%a2@(2)
    267c:	1f69 003c 002b 	moveb %a1@(60),%sp@(43)
    2682:	156f 002b 053c 	moveb %sp@(43),%a2@(1340)
    2688:	1429 003f      	moveb %a1@(63),%d2
    268c:	1542 053e      	moveb %d2,%a2@(1342)
    2690:	1569 003d 053d 	moveb %a1@(61),%a2@(1341)
    2696:	1f69 003e 002a 	moveb %a1@(62),%sp@(42)
    269c:	156f 002a 053f 	moveb %sp@(42),%a2@(1343)
    26a2:	422a 0540      	clrb %a2@(1344)
    26a6:	422a 0541      	clrb %a2@(1345)
    26aa:	422a 0542      	clrb %a2@(1346)
    26ae:	422a 0543      	clrb %a2@(1347)
    26b2:	1483           	moveb %d3,%a2@
    26b4:	2545 0118      	movel %d5,%a2@(280)
    26b8:	7000           	moveq #0,%d0
    26ba:	1029 0008      	moveb %a1@(8),%d0
    26be:	e148           	lslw #8,%d0
    26c0:	4840           	swap %d0
    26c2:	4240           	clrw %d0
    26c4:	7200           	moveq #0,%d1
    26c6:	1229 0009      	moveb %a1@(9),%d1
    26ca:	4841           	swap %d1
    26cc:	4241           	clrw %d1
    26ce:	8280           	orl %d0,%d1
    26d0:	7000           	moveq #0,%d0
    26d2:	1029 000a      	moveb %a1@(10),%d0
    26d6:	e188           	lsll #8,%d0
    26d8:	8081           	orl %d1,%d0
    26da:	8029 000b      	orb %a1@(11),%d0
    26de:	4bf1 0800      	lea %a1@(0,%d0:l),%a5
    26e2:	254d 000a      	movel %a5,%a2@(10)
    26e6:	7000           	moveq #0,%d0
    26e8:	1029 000c      	moveb %a1@(12),%d0
    26ec:	e148           	lslw #8,%d0
    26ee:	4840           	swap %d0
    26f0:	4240           	clrw %d0
    26f2:	7200           	moveq #0,%d1
    26f4:	1229 000d      	moveb %a1@(13),%d1
    26f8:	4841           	swap %d1
    26fa:	4241           	clrw %d1
    26fc:	8280           	orl %d0,%d1
    26fe:	7000           	moveq #0,%d0
    2700:	1029 000e      	moveb %a1@(14),%d0
    2704:	e188           	lsll #8,%d0
    2706:	8081           	orl %d1,%d0
    2708:	8029 000f      	orb %a1@(15),%d0
    270c:	47f1 0800      	lea %a1@(0,%d0:l),%a3
    2710:	42af 002c      	clrl %sp@(44)
    2714:	7820           	moveq #32,%d4
    2716:	254b 0520      	movel %a3,%a2@(1312)
    271a:	7200           	moveq #0,%d1
    271c:	6000 fdec      	braw 0x250a
    2720:	7002           	moveq #2,%d0
    2722:	4cdf 6cfc      	moveml %sp@+,%d2-%d7/%a2-%a3/%a5-%fp
    2726:	508f           	addql #8,%sp
    2728:	4e75           	rts
    272a:	4878 0018      	pea 0x18
    272e:	4869 0042      	pea %a1@(66)
    2732:	486a 0524      	pea %a2@(1316)
    2736:	41fa fc0c      	lea %pc@(0x2344),%a0
    273a:	4e90           	jsr %a0@
    273c:	4fef 000c      	lea %sp@(12),%sp
    2740:	4247           	clrw %d7
    2742:	1e2f 002a      	moveb %sp@(42),%d7
    2746:	3547 0110      	movew %d7,%a2@(272)
    274a:	2545 0114      	movel %d5,%a2@(276)
    274e:	426a 010e      	clrw %a2@(270)
    2752:	4240           	clrw %d0
    2754:	102f 002b      	moveb %sp@(43),%d0
    2758:	3540 0112      	movew %d0,%a2@(274)
    275c:	1542 0001      	moveb %d2,%a2@(1)
    2760:	4240           	clrw %d0
    2762:	1002           	moveb %d2,%d0
    2764:	3540 0004      	movew %d0,%a2@(4)
    2768:	202f 002c      	movel %sp@(44),%d0
    276c:	d08d           	addl %a5,%d0
    276e:	2540 0006      	movel %d0,%a2@(6)
    2772:	7200           	moveq #0,%d1
    2774:	1202           	moveb %d2,%d1
    2776:	c2fc 0003      	muluw #3,%d1
    277a:	0281 0000 ffff 	andil #65535,%d1
    2780:	41ea 0124      	lea %a2@(292),%a0
    2784:	45ea 0520      	lea %a2@(1312),%a2
    2788:	6000 fe7c      	braw 0x2606
    278c:	7820           	moveq #32,%d4
    278e:	254b 0520      	movel %a3,%a2@(1312)
    2792:	7200           	moveq #0,%d1
    2794:	6000 fd74      	braw 0x250a
    2798:	48e7 3f30      	moveml %d2-%d7/%a2-%a3,%sp@-
    279c:	202f 0024      	movel %sp@(36),%d0
    27a0:	282f 0028      	movel %sp@(40),%d4
    27a4:	226f 002c      	moveal %sp@(44),%a1
    27a8:	2a09           	movel %a1,%d5
    27aa:	5385           	subql #1,%d5
    27ac:	b2fc 0000      	cmpaw #0,%a1
    27b0:	6700 00ae      	beqw 0x2860
    27b4:	1e04           	moveb %d4,%d7
    27b6:	2200           	movel %d0,%d1
    27b8:	4481           	negl %d1
    27ba:	7403           	moveq #3,%d2
    27bc:	c282           	andl %d2,%d1
    27be:	7c05           	moveq #5,%d6
    27c0:	2440           	moveal %d0,%a2
    27c2:	bc85           	cmpl %d5,%d6
    27c4:	646a           	bccs 0x2830
    27c6:	4a81           	tstl %d1
    27c8:	6724           	beqs 0x27ee
    27ca:	14c4           	moveb %d4,%a2@+
    27cc:	5385           	subql #1,%d5
    27ce:	7401           	moveq #1,%d2
    27d0:	b481           	cmpl %d1,%d2
    27d2:	671a           	beqs 0x27ee
    27d4:	2440           	moveal %d0,%a2
    27d6:	548a           	addql #2,%a2
    27d8:	2040           	moveal %d0,%a0
    27da:	1144 0001      	moveb %d4,%a0@(1)
    27de:	5385           	subql #1,%d5
    27e0:	7403           	moveq #3,%d2
    27e2:	b481           	cmpl %d1,%d2
    27e4:	6608           	bnes 0x27ee
    27e6:	528a           	addql #1,%a2
    27e8:	1144 0002      	moveb %d4,%a0@(2)
    27ec:	5385           	subql #1,%d5
    27ee:	2609           	movel %a1,%d3
    27f0:	9681           	subl %d1,%d3
    27f2:	7c00           	moveq #0,%d6
    27f4:	1c04           	moveb %d4,%d6
    27f6:	2406           	movel %d6,%d2
    27f8:	4842           	swap %d2
    27fa:	4242           	clrw %d2
    27fc:	2042           	moveal %d2,%a0
    27fe:	2404           	movel %d4,%d2
    2800:	e14a           	lslw #8,%d2
    2802:	4842           	swap %d2
    2804:	4242           	clrw %d2
    2806:	e18e           	lsll #8,%d6
    2808:	2646           	moveal %d6,%a3
    280a:	2c08           	movel %a0,%d6
    280c:	8486           	orl %d6,%d2
    280e:	2c0b           	movel %a3,%d6
    2810:	8486           	orl %d6,%d2
    2812:	1407           	moveb %d7,%d2
    2814:	2040           	moveal %d0,%a0
    2816:	d1c1           	addal %d1,%a0
    2818:	72fc           	moveq #-4,%d1
    281a:	c283           	andl %d3,%d1
    281c:	d288           	addl %a0,%d1
    281e:	20c2           	movel %d2,%a0@+
    2820:	b288           	cmpl %a0,%d1
    2822:	66fa           	bnes 0x281e
    2824:	72fc           	moveq #-4,%d1
    2826:	c283           	andl %d3,%d1
    2828:	d5c1           	addal %d1,%a2
    282a:	9a81           	subl %d1,%d5
    282c:	b283           	cmpl %d3,%d1
    282e:	6730           	beqs 0x2860
    2830:	1484           	moveb %d4,%a2@
    2832:	4a85           	tstl %d5
    2834:	672a           	beqs 0x2860
    2836:	1544 0001      	moveb %d4,%a2@(1)
    283a:	7201           	moveq #1,%d1
    283c:	b285           	cmpl %d5,%d1
    283e:	6720           	beqs 0x2860
    2840:	1544 0002      	moveb %d4,%a2@(2)
    2844:	7402           	moveq #2,%d2
    2846:	b485           	cmpl %d5,%d2
    2848:	6716           	beqs 0x2860
    284a:	1544 0003      	moveb %d4,%a2@(3)
    284e:	7c03           	moveq #3,%d6
    2850:	bc85           	cmpl %d5,%d6
    2852:	670c           	beqs 0x2860
    2854:	1544 0004      	moveb %d4,%a2@(4)
    2858:	5985           	subql #4,%d5
    285a:	6704           	beqs 0x2860
    285c:	1544 0005      	moveb %d4,%a2@(5)
    2860:	4cdf 0cfc      	moveml %sp@+,%d2-%d7/%a2-%a3
    2864:	4e75           	rts
    2866:	4fef ff90      	lea %sp@(-112),%sp
    286a:	48e7 3f36      	moveml %d2-%d7/%a2-%a3/%a5-%fp,%sp@-
    286e:	4878 1c76      	pea 0x1c76
    2872:	42a7           	clrl %sp@-
    2874:	2f2f 00a4      	movel %sp@(164),%sp@-
    2878:	41fa ff1e      	lea %pc@(0x2798),%a0
    287c:	2f48 007a      	movel %a0,%sp@(122)
    2880:	4e90           	jsr %a0@
    2882:	45fa 1c5c      	lea %pc@(0x44e0),%a2
    2886:	4fef 000c      	lea %sp@(12),%sp
    288a:	4a6a 0002      	tstw %a2@(2)
    288e:	6700 0a6e      	beqw 0x32fe
    2892:	41fa 20d0      	lea %pc@(0x4964),%a0
    2896:	43fa 22ca      	lea %pc@(0x4b62),%a1
    289a:	4240           	clrw %d0
    289c:	30c0           	movew %d0,%a0@+
    289e:	5640           	addqw #3,%d0
    28a0:	b1c9           	cmpal %a1,%a0
    28a2:	66f8           	bnes 0x289c
    28a4:	226f 00a4      	moveal %sp@(164),%a1
    28a8:	7200           	moveq #0,%d1
    28aa:	3229 0004      	movew %a1@(4),%d1
    28ae:	c2fc 0003      	muluw #3,%d1
    28b2:	0281 0000 ffff 	andil #65535,%d1
    28b8:	2029 0006      	movel %a1@(6),%d0
    28bc:	41e9 0124      	lea %a1@(292),%a0
    28c0:	43e9 0520      	lea %a1@(1312),%a1
    28c4:	20c0           	movel %d0,%a0@+
    28c6:	d081           	addl %d1,%d0
    28c8:	b3c8           	cmpal %a0,%a1
    28ca:	66f8           	bnes 0x28c4
    28cc:	246f 009c      	moveal %sp@(156),%a2
    28d0:	422a 0a02      	clrb %a2@(2562)
    28d4:	256f 00a4 09fe 	movel %sp@(164),%a2@(2558)
    28da:	422a 09f8      	clrb %a2@(2552)
    28de:	357c ffff 09fa 	movew #-1,%a2@(2554)
    28e4:	357c 0600 09fc 	movew #1536,%a2@(2556)
    28ea:	422a 1c74      	clrb %a2@(7284)
    28ee:	206f 00a4      	moveal %sp@(164),%a0
    28f2:	2028 0120      	movel %a0@(288),%d0
    28f6:	157c 0040 0006 	moveb #64,%a2@(6)
    28fc:	426a 0012      	clrw %a2@(18)
    2900:	426a 0014      	clrw %a2@(20)
    2904:	357c 00ff 0016 	movew #255,%a2@(22)
    290a:	422a 0018      	clrb %a2@(24)
    290e:	426a 0008      	clrw %a2@(8)
    2912:	426a 000a      	clrw %a2@(10)
    2916:	426a 000c      	clrw %a2@(12)
    291a:	422a 000e      	clrb %a2@(14)
    291e:	4292           	clrl %a2@
    2920:	42aa 005c      	clrl %a2@(92)
    2924:	7203           	moveq #3,%d1
    2926:	2541 0042      	movel %d1,%a2@(66)
    292a:	2540 003e      	movel %d0,%a2@(62)
    292e:	157c 0040 0284 	moveb #64,%a2@(644)
    2934:	426a 0290      	clrw %a2@(656)
    2938:	426a 0292      	clrw %a2@(658)
    293c:	357c 00ff 0294 	movew #255,%a2@(660)
    2942:	422a 0296      	clrb %a2@(662)
    2946:	426a 0286      	clrw %a2@(646)
    294a:	426a 0288      	clrw %a2@(648)
    294e:	426a 028a      	clrw %a2@(650)
    2952:	422a 028c      	clrb %a2@(652)
    2956:	42aa 027e      	clrl %a2@(638)
    295a:	42aa 02da      	clrl %a2@(730)
    295e:	2541 02c0      	movel %d1,%a2@(704)
    2962:	2540 02bc      	movel %d0,%a2@(700)
    2966:	157c 0040 0502 	moveb #64,%a2@(1282)
    296c:	426a 050e      	clrw %a2@(1294)
    2970:	426a 0510      	clrw %a2@(1296)
    2974:	357c 00ff 0512 	movew #255,%a2@(1298)
    297a:	422a 0514      	clrb %a2@(1300)
    297e:	426a 0504      	clrw %a2@(1284)
    2982:	426a 0506      	clrw %a2@(1286)
    2986:	426a 0508      	clrw %a2@(1288)
    298a:	422a 050a      	clrb %a2@(1290)
    298e:	42aa 04fc      	clrl %a2@(1276)
    2992:	42aa 0558      	clrl %a2@(1368)
    2996:	2541 053e      	movel %d1,%a2@(1342)
    299a:	2540 053a      	movel %d0,%a2@(1338)
    299e:	157c 0040 0780 	moveb #64,%a2@(1920)
    29a4:	426a 078c      	clrw %a2@(1932)
    29a8:	426a 078e      	clrw %a2@(1934)
    29ac:	357c 00ff 0790 	movew #255,%a2@(1936)
    29b2:	422a 0792      	clrb %a2@(1938)
    29b6:	426a 0782      	clrw %a2@(1922)
    29ba:	426a 0784      	clrw %a2@(1924)
    29be:	426a 0786      	clrw %a2@(1926)
    29c2:	422a 0788      	clrb %a2@(1928)
    29c6:	42aa 077a      	clrl %a2@(1914)
    29ca:	42aa 07d6      	clrl %a2@(2006)
    29ce:	2541 07bc      	movel %d1,%a2@(1980)
    29d2:	2540 07b8      	movel %d0,%a2@(1976)
    29d6:	41fa 19d0      	lea %pc@(0x43a8),%a0
    29da:	2f48 0032      	movel %a0,%sp@(50)
    29de:	45ea 0be8      	lea %a2@(3048),%a2
    29e2:	2f4a 002e      	movel %a2,%sp@(46)
    29e6:	9bcd           	subal %a5,%a5
    29e8:	43fa 17a0      	lea %pc@(0x418a),%a1
    29ec:	2f49 0046      	movel %a1,%sp@(70)
    29f0:	45fa 173c      	lea %pc@(0x412e),%a2
    29f4:	2f4a 0036      	movel %a2,%sp@(54)
    29f8:	206f 0032      	moveal %sp@(50),%a0
    29fc:	54af 0032      	addql #2,%sp@(50)
    2a00:	7000           	moveq #0,%d0
    2a02:	3018           	movew %a0@+,%d0
    2a04:	2f00           	movel %d0,%sp@-
    2a06:	2f3c 0040 0000 	movel #4194304,%sp@-
    2a0c:	226f 004e      	moveal %sp@(78),%a1
    2a10:	4e91           	jsr %a1@
    2a12:	508f           	addql #8,%sp
    2a14:	2e00           	movel %d0,%d7
    2a16:	246f 002e      	moveal %sp@(46),%a2
    2a1a:	1480           	moveb %d0,%a2@
    2a1c:	2f00           	movel %d0,%sp@-
    2a1e:	2f3c 0000 ff00 	movel #65280,%sp@-
    2a24:	206f 003e      	moveal %sp@(62),%a0
    2a28:	4e90           	jsr %a0@
    2a2a:	508f           	addql #8,%sp
    2a2c:	3c40           	moveaw %d0,%fp
    2a2e:	2007           	movel %d7,%d0
    2a30:	e288           	lsrl #1,%d0
    2a32:	2640           	moveal %d0,%a3
    2a34:	2607           	movel %d7,%d3
    2a36:	e48b           	lsrl #2,%d3
    2a38:	4443           	negw %d3
    2a3a:	7c00           	moveq #0,%d6
    2a3c:	4244           	clrw %d4
    2a3e:	93c9           	subal %a1,%a1
    2a40:	7400           	moveq #0,%d2
    2a42:	2a0d           	movel %a5,%d5
    2a44:	da8d           	addl %a5,%d5
    2a46:	da8d           	addl %a5,%d5
    2a48:	ef8d           	lsll #7,%d5
    2a4a:	da8d           	addl %a5,%d5
    2a4c:	daaf 009c      	addl %sp@(156),%d5
    2a50:	2f4d 003a      	movel %a5,%sp@(58)
    2a54:	7000           	moveq #0,%d0
    2a56:	3009           	movew %a1,%d0
    2a58:	e080           	asrl #8,%d0
    2a5a:	727f           	moveq #127,%d1
    2a5c:	9200           	subb %d0,%d1
    2a5e:	d000           	addb %d0,%d0
    2a60:	3043           	moveaw %d3,%a0
    2a62:	4a43           	tstw %d3
    2a64:	6d00 027c      	bltw 0x2ce2
    2a68:	3048           	moveaw %a0,%a0
    2a6a:	b7c6           	cmpal %d6,%a3
    2a6c:	6400 027e      	bccw 0x2cec
    2a70:	7c7f           	moveq #127,%d6
    2a72:	9c00           	subb %d0,%d6
    2a74:	3446           	moveaw %d6,%a2
    2a76:	7080           	moveq #-128,%d0
    2a78:	2a45           	moveal %d5,%a5
    2a7a:	dbc2           	addal %d2,%a5
    2a7c:	1b41 0a68      	moveb %d1,%a5@(2664)
    2a80:	d1c5           	addal %d5,%a0
    2a82:	320a           	movew %a2,%d1
    2a84:	1141 0b68      	moveb %d1,%a0@(2920)
    2a88:	1b40 0ae8      	moveb %d0,%a5@(2792)
    2a8c:	d2ce           	addaw %fp,%a1
    2a8e:	5244           	addqw #1,%d4
    2a90:	7400           	moveq #0,%d2
    2a92:	3404           	movew %d4,%d2
    2a94:	2c02           	movel %d2,%d6
    2a96:	5243           	addqw #1,%d3
    2a98:	be82           	cmpl %d2,%d7
    2a9a:	62b8           	bhis 0x2a54
    2a9c:	2a6f 003a      	moveal %sp@(58),%a5
    2aa0:	528d           	addql #1,%a5
    2aa2:	06af 0000 0181 	addil #385,%sp@(46)
    2aa8:	002e 
    2aaa:	740c           	moveq #12,%d2
    2aac:	b48d           	cmpl %a5,%d2
    2aae:	6600 ff48      	bnew 0x29f8
    2ab2:	4aaf 00a0      	tstl %sp@(160)
    2ab6:	6700 0082      	beqw 0x2b3a
    2aba:	206f 009c      	moveal %sp@(156),%a0
    2abe:	216f 00a0 0a64 	movel %sp@(160),%a0@(2660)
    2ac4:	226f 00a0      	moveal %sp@(160),%a1
    2ac8:	4211           	clrb %a1@
    2aca:	2068 0a64      	moveal %a0@(2660),%a0
    2ace:	4228 0001      	clrb %a0@(1)
    2ad2:	206f 00a4      	moveal %sp@(164),%a0
    2ad6:	1010           	moveb %a0@,%d0
    2ad8:	6760           	beqs 0x2b3a
    2ada:	2448           	moveal %a0,%a2
    2adc:	206f 009c      	moveal %sp@(156),%a0
    2ae0:	2628 0a64      	movel %a0@(2660),%d3
    2ae4:	43e8 0a04      	lea %a0@(2564),%a1
    2ae8:	307c 0014      	moveaw #20,%a0
    2aec:	d1ea 0120      	addal %a2@(288),%a0
    2af0:	0280 0000 00ff 	andil #255,%d0
    2af6:	d080           	addl %d0,%d0
    2af8:	d080           	addl %d0,%d0
    2afa:	242f 009c      	movel %sp@(156),%d2
    2afe:	d480           	addl %d0,%d2
    2b00:	0682 0000 0a04 	addil #2564,%d2
    2b06:	7202           	moveq #2,%d1
    2b08:	2003           	movel %d3,%d0
    2b0a:	d081           	addl %d1,%d0
    2b0c:	22c0           	movel %d0,%a1@+
    2b0e:	7000           	moveq #0,%d0
    2b10:	1028 0005      	moveb %a0@(5),%d0
    2b14:	5280           	addql #1,%d0
    2b16:	ef88           	lsll #7,%d0
    2b18:	0810 0002      	btst #2,%a0@
    2b1c:	6700 0208      	beqw 0x2d26
    2b20:	2800           	movel %d0,%d4
    2b22:	e28c           	lsrl #1,%d4
    2b24:	2a00           	movel %d0,%d5
    2b26:	e48d           	lsrl #2,%d5
    2b28:	d885           	addl %d5,%d4
    2b2a:	d880           	addl %d0,%d4
    2b2c:	e688           	lsrl #3,%d0
    2b2e:	d084           	addl %d4,%d0
    2b30:	d280           	addl %d0,%d1
    2b32:	41e8 002a      	lea %a0@(42),%a0
    2b36:	b489           	cmpl %a1,%d2
    2b38:	66ce           	bnes 0x2b08
    2b3a:	2039 00df f004 	movel 0xdff004,%d0
    2b40:	2f40 0088      	movel %d0,%sp@(136)
    2b44:	202f 0088      	movel %sp@(136),%d0
    2b48:	e088           	lsrl #8,%d0
    2b4a:	0280 0000 01ff 	andil #511,%d0
    2b50:	2f40 0088      	movel %d0,%sp@(136)
    2b54:	202f 0088      	movel %sp@(136),%d0
    2b58:	0c80 0000 00c8 	cmpil #200,%d0
    2b5e:	66da           	bnes 0x2b3a
    2b60:	2039 00df f004 	movel 0xdff004,%d0
    2b66:	2f40 0084      	movel %d0,%sp@(132)
    2b6a:	202f 0084      	movel %sp@(132),%d0
    2b6e:	e088           	lsrl #8,%d0
    2b70:	0280 0000 01ff 	andil #511,%d0
    2b76:	2f40 0084      	movel %d0,%sp@(132)
    2b7a:	202f 0084      	movel %sp@(132),%d0
    2b7e:	0c80 0000 00c7 	cmpil #199,%d0
    2b84:	66da           	bnes 0x2b60
    2b86:	33fc 0780 00df 	movew #1920,0xdff09a
    2b8c:	f09a 
    2b8e:	33fc 0780 00df 	movew #1920,0xdff09c
    2b94:	f09c 
    2b96:	33fc 0780 00df 	movew #1920,0xdff09c
    2b9c:	f09c 
    2b9e:	207c 00bf e001 	moveal #12574721,%a0
    2ba4:	1010           	moveb %a0@,%d0
    2ba6:	0000 0002      	orib #2,%d0
    2baa:	1080           	moveb %d0,%a0@
    2bac:	33fc 000f 00df 	movew #15,0xdff096
    2bb2:	f096 
    2bb4:	2039 00df f004 	movel 0xdff004,%d0
    2bba:	2f40 0080      	movel %d0,%sp@(128)
    2bbe:	202f 0080      	movel %sp@(128),%d0
    2bc2:	e088           	lsrl #8,%d0
    2bc4:	0280 0000 01ff 	andil #511,%d0
    2bca:	2f40 0080      	movel %d0,%sp@(128)
    2bce:	202f 0080      	movel %sp@(128),%d0
    2bd2:	0c80 0000 00c8 	cmpil #200,%d0
    2bd8:	66da           	bnes 0x2bb4
    2bda:	2039 00df f004 	movel 0xdff004,%d0
    2be0:	2f40 007c      	movel %d0,%sp@(124)
    2be4:	202f 007c      	movel %sp@(124),%d0
    2be8:	e088           	lsrl #8,%d0
    2bea:	0280 0000 01ff 	andil #511,%d0
    2bf0:	2f40 007c      	movel %d0,%sp@(124)
    2bf4:	202f 007c      	movel %sp@(124),%d0
    2bf8:	0c80 0000 00c7 	cmpil #199,%d0
    2bfe:	66da           	bnes 0x2bda
    2c00:	7200           	moveq #0,%d1
    2c02:	23c1 00df f0a0 	movel %d1,0xdff0a0
    2c08:	33fc 0002 00df 	movew #2,0xdff0a4
    2c0e:	f0a4 
    2c10:	33fc 0000 00df 	movew #0,0xdff0a8
    2c16:	f0a8 
    2c18:	33fc 0000 00df 	movew #0,0xdff0a6
    2c1e:	f0a6 
    2c20:	23c1 00df f0b0 	movel %d1,0xdff0b0
    2c26:	33fc 0002 00df 	movew #2,0xdff0b4
    2c2c:	f0b4 
    2c2e:	33fc 0000 00df 	movew #0,0xdff0b8
    2c34:	f0b8 
    2c36:	33fc 0000 00df 	movew #0,0xdff0b6
    2c3c:	f0b6 
    2c3e:	23c1 00df f0c0 	movel %d1,0xdff0c0
    2c44:	33fc 0002 00df 	movew #2,0xdff0c4
    2c4a:	f0c4 
    2c4c:	33fc 0000 00df 	movew #0,0xdff0c8
    2c52:	f0c8 
    2c54:	33fc 0000 00df 	movew #0,0xdff0c6
    2c5a:	f0c6 
    2c5c:	23c1 00df f0d0 	movel %d1,0xdff0d0
    2c62:	33fc 0002 00df 	movew #2,0xdff0d4
    2c68:	f0d4 
    2c6a:	33fc 0000 00df 	movew #0,0xdff0d8
    2c70:	f0d8 
    2c72:	33fc 0000 00df 	movew #0,0xdff0d6
    2c78:	f0d6 
    2c7a:	33fc 820f 00df 	movew #-32241,0xdff096
    2c80:	f096 
    2c82:	2039 00df f004 	movel 0xdff004,%d0
    2c88:	2f40 0090      	movel %d0,%sp@(144)
    2c8c:	202f 0090      	movel %sp@(144),%d0
    2c90:	e088           	lsrl #8,%d0
    2c92:	0280 0000 01ff 	andil #511,%d0
    2c98:	2f40 0090      	movel %d0,%sp@(144)
    2c9c:	202f 0090      	movel %sp@(144),%d0
    2ca0:	0c80 0000 00c8 	cmpil #200,%d0
    2ca6:	66da           	bnes 0x2c82
    2ca8:	2039 00df f004 	movel 0xdff004,%d0
    2cae:	2f40 008c      	movel %d0,%sp@(140)
    2cb2:	202f 008c      	movel %sp@(140),%d0
    2cb6:	e088           	lsrl #8,%d0
    2cb8:	0280 0000 01ff 	andil #511,%d0
    2cbe:	2f40 008c      	movel %d0,%sp@(140)
    2cc2:	202f 008c      	movel %sp@(140),%d0
    2cc6:	0c80 0000 00c7 	cmpil #199,%d0
    2ccc:	66da           	bnes 0x2ca8
    2cce:	206f 00a4      	moveal %sp@(164),%a0
    2cd2:	4a10           	tstb %a0@
    2cd4:	6600 0088      	bnew 0x2d5e
    2cd8:	4cdf 6cfc      	moveml %sp@+,%d2-%d7/%a2-%a3/%a5-%fp
    2cdc:	4fef 0070      	lea %sp@(112),%sp
    2ce0:	4e75           	rts
    2ce2:	d0c7           	addaw %d7,%a0
    2ce4:	3048           	moveaw %a0,%a0
    2ce6:	b7c6           	cmpal %d6,%a3
    2ce8:	6500 fd86      	bcsw 0x2a70
    2cec:	0600 ff80      	addib #-128,%d0
    2cf0:	3440           	moveaw %d0,%a2
    2cf2:	707f           	moveq #127,%d0
    2cf4:	b7c6           	cmpal %d6,%a3
    2cf6:	6600 fd80      	bnew 0x2a78
    2cfa:	7080           	moveq #-128,%d0
    2cfc:	2a45           	moveal %d5,%a5
    2cfe:	dbc2           	addal %d2,%a5
    2d00:	1b41 0a68      	moveb %d1,%a5@(2664)
    2d04:	d1c5           	addal %d5,%a0
    2d06:	320a           	movew %a2,%d1
    2d08:	1141 0b68      	moveb %d1,%a0@(2920)
    2d0c:	1b40 0ae8      	moveb %d0,%a5@(2792)
    2d10:	d2ce           	addaw %fp,%a1
    2d12:	5244           	addqw #1,%d4
    2d14:	7400           	moveq #0,%d2
    2d16:	3404           	movew %d4,%d2
    2d18:	2c02           	movel %d2,%d6
    2d1a:	5243           	addqw #1,%d3
    2d1c:	be82           	cmpl %d2,%d7
    2d1e:	6200 fd34      	bhiw 0x2a54
    2d22:	6000 fd78      	braw 0x2a9c
    2d26:	d280           	addl %d0,%d1
    2d28:	41e8 002a      	lea %a0@(42),%a0
    2d2c:	b489           	cmpl %a1,%d2
    2d2e:	6600 fdd8      	bnew 0x2b08
    2d32:	2039 00df f004 	movel 0xdff004,%d0
    2d38:	2f40 0088      	movel %d0,%sp@(136)
    2d3c:	202f 0088      	movel %sp@(136),%d0
    2d40:	e088           	lsrl #8,%d0
    2d42:	0280 0000 01ff 	andil #511,%d0
    2d48:	2f40 0088      	movel %d0,%sp@(136)
    2d4c:	202f 0088      	movel %sp@(136),%d0
    2d50:	0c80 0000 00c8 	cmpil #200,%d0
    2d56:	6600 fde2      	bnew 0x2b3a
    2d5a:	6000 fe04      	braw 0x2b60
    2d5e:	226f 009c      	moveal %sp@(156),%a1
    2d62:	43e9 0a68      	lea %a1@(2664),%a1
    2d66:	2f49 0062      	movel %a1,%sp@(98)
    2d6a:	42af 0066      	clrl %sp@(102)
    2d6e:	41e8 0524      	lea %a0@(1316),%a0
    2d72:	2f48 0078      	movel %a0,%sp@(120)
    2d76:	45ef 0094      	lea %sp@(148),%a2
    2d7a:	2f4a 0056      	movel %a2,%sp@(86)
    2d7e:	206f 0078      	moveal %sp@(120),%a0
    2d82:	226f 0066      	moveal %sp@(102),%a1
    2d86:	1f70 9800 0076 	moveb %a0@(0,%a1:l),%sp@(118)
    2d8c:	246f 009c      	moveal %sp@(156),%a2
    2d90:	206a 09fe      	moveal %a2@(2558),%a0
    2d94:	4240           	clrw %d0
    2d96:	102f 0076      	moveb %sp@(118),%d0
    2d9a:	c0fc 002a      	muluw #42,%d0
    2d9e:	2c68 0120      	moveal %a0@(288),%fp
    2da2:	ddc0           	addal %d0,%fp
    2da4:	7000           	moveq #0,%d0
    2da6:	102f 0076      	moveb %sp@(118),%d0
    2daa:	0680 0000 0281 	addil #641,%d0
    2db0:	d080           	addl %d0,%d0
    2db2:	d080           	addl %d0,%d0
    2db4:	2f72 0800 004e 	movel %a2@(0,%d0:l),%sp@(78)
    2dba:	7000           	moveq #0,%d0
    2dbc:	102e 0019      	moveb %fp@(25),%d0
    2dc0:	5280           	addql #1,%d0
    2dc2:	c0fc 0080      	muluw #128,%d0
    2dc6:	2f40 0042      	movel %d0,%sp@(66)
    2dca:	2f00           	movel %d0,%sp@-
    2dcc:	42a7           	clrl %sp@-
    2dce:	2f2f 0056      	movel %sp@(86),%sp@-
    2dd2:	206f 007a      	moveal %sp@(122),%a0
    2dd6:	4e90           	jsr %a0@
    2dd8:	1f6e 0017 0058 	moveb %fp@(23),%sp@(88)
    2dde:	1f6f 0058 00a0 	moveb %sp@(88),%sp@(160)
    2de4:	102e 000e      	moveb %fp@(14),%d0
    2de8:	d02f 0058      	addb %sp@(88),%d0
    2dec:	1f40 00a1      	moveb %d0,%sp@(161)
    2df0:	122e 000f      	moveb %fp@(15),%d1
    2df4:	d22f 0058      	addb %sp@(88),%d1
    2df8:	1f41 00a2      	moveb %d1,%sp@(162)
    2dfc:	142e 0010      	moveb %fp@(16),%d2
    2e00:	d42f 0058      	addb %sp@(88),%d2
    2e04:	1f42 00a3      	moveb %d2,%sp@(163)
    2e08:	122e 000e      	moveb %fp@(14),%d1
    2e0c:	822e 000f      	orb %fp@(15),%d1
    2e10:	822e 0010      	orb %fp@(16),%d1
    2e14:	4fef 000c      	lea %sp@(12),%sp
    2e18:	57c1           	seq %d1
    2e1a:	4401           	negb %d1
    2e1c:	102e 0029      	moveb %fp@(41),%d0
    2e20:	e608           	lsrb #3,%d0
    2e22:	1600           	moveb %d0,%d3
    2e24:	0203 0003      	andib #3,%d3
    2e28:	1f43 0077      	moveb %d3,%sp@(119)
    2e2c:	97cb           	subal %a3,%a3
    2e2e:	42af 005a      	clrl %sp@(90)
    2e32:	0281 0000 00ff 	andil #255,%d1
    2e38:	2f41 005e      	movel %d1,%sp@(94)
    2e3c:	282f 0042      	movel %sp@(66),%d4
    2e40:	d8af 004e      	addl %sp@(78),%d4
    2e44:	2f44 006a      	movel %d4,%sp@(106)
    2e48:	7c03           	moveq #3,%d6
    2e4a:	c086           	andl %d6,%d0
    2e4c:	7e09           	moveq #9,%d7
    2e4e:	9e80           	subl %d0,%d7
    2e50:	2f47 0072      	movel %d7,%sp@(114)
    2e54:	2a4e           	moveal %fp,%a5
    2e56:	2c4b           	moveal %a3,%fp
    2e58:	42af 002e      	clrl %sp@(46)
    2e5c:	41fa 12ae      	lea %pc@(0x410c),%a0
    2e60:	2f48 0032      	movel %a0,%sp@(50)
    2e64:	41ef 0094      	lea %sp@(148),%a0
    2e68:	226f 002e      	moveal %sp@(46),%a1
    2e6c:	1030 9800      	moveb %a0@(0,%a1:l),%d0
    2e70:	b2fc 0000      	cmpaw #0,%a1
    2e74:	6708           	beqs 0x2e7e
    2e76:	b02f 004c      	cmpb %sp@(76),%d0
    2e7a:	6700 0248      	beqw 0x30c4
    2e7e:	4880           	extw %d0
    2e80:	3040           	moveaw %d0,%a0
    2e82:	0c40 000b      	cmpiw #11,%d0
    2e86:	6f00 067a      	blew 0x3502
    2e8a:	45e8 fff4      	lea %a0@(-12),%a2
    2e8e:	700b           	moveq #11,%d0
    2e90:	b08a           	cmpl %a2,%d0
    2e92:	6c00 0ef8      	bgew 0x3d8c
    2e96:	45e8 ffe8      	lea %a0@(-24),%a2
    2e9a:	b08a           	cmpl %a2,%d0
    2e9c:	6c00 0ef4      	bgew 0x3d92
    2ea0:	45e8 ffdc      	lea %a0@(-36),%a2
    2ea4:	b08a           	cmpl %a2,%d0
    2ea6:	6c00 0f28      	bgew 0x3dd0
    2eaa:	45e8 ffd0      	lea %a0@(-48),%a2
    2eae:	b08a           	cmpl %a2,%d0
    2eb0:	6c00 0f9a      	bgew 0x3e4c
    2eb4:	45e8 ffc4      	lea %a0@(-60),%a2
    2eb8:	b08a           	cmpl %a2,%d0
    2eba:	6c00 0f96      	bgew 0x3e52
    2ebe:	45e8 ffb8      	lea %a0@(-72),%a2
    2ec2:	b08a           	cmpl %a2,%d0
    2ec4:	6c00 0f9e      	bgew 0x3e64
    2ec8:	45e8 ffac      	lea %a0@(-84),%a2
    2ecc:	b08a           	cmpl %a2,%d0
    2ece:	6c00 0f9a      	bgew 0x3e6a
    2ed2:	45e8 ffa0      	lea %a0@(-96),%a2
    2ed6:	b08a           	cmpl %a2,%d0
    2ed8:	6c00 1128      	bgew 0x4002
    2edc:	45e8 ff94      	lea %a0@(-108),%a2
    2ee0:	b08a           	cmpl %a2,%d0
    2ee2:	6c00 1124      	bgew 0x4008
    2ee6:	45e8 ff88      	lea %a0@(-120),%a2
    2eea:	760a           	moveq #10,%d3
    2eec:	43f2 a800      	lea %a2@(0,%a2:l),%a1
    2ef0:	d3ca           	addal %a2,%a1
    2ef2:	2209           	movel %a1,%d1
    2ef4:	ef89           	lsll #7,%d1
    2ef6:	2241           	moveal %d1,%a1
    2ef8:	d3ca           	addal %a2,%a1
    2efa:	d3ef 0062      	addal %sp@(98),%a1
    2efe:	102d 0014      	moveb %a5@(20),%d0
    2f02:	1200           	moveb %d0,%d1
    2f04:	0201 0003      	andib #3,%d1
    2f08:	6600 069e      	bnew 0x35a8
    2f0c:	2c49           	moveal %a1,%fp
    2f0e:	3203           	movew %d3,%d1
    2f10:	48c1           	extl %d1
    2f12:	4a43           	tstw %d3
    2f14:	6f00 06a8      	blew 0x35be
    2f18:	243c 0000 8000 	movel #32768,%d2
    2f1e:	e3aa           	lsll %d1,%d2
    2f20:	2442           	moveal %d2,%a2
    2f22:	1f6d 0015 004b 	moveb %a5@(21),%sp@(75)
    2f28:	1f6d 0011 0054 	moveb %a5@(17),%sp@(84)
    2f2e:	7400           	moveq #0,%d2
    2f30:	1429 0180      	moveb %a1@(384),%d2
    2f34:	182d 0021      	moveb %a5@(33),%d4
    2f38:	1c04           	moveb %d4,%d6
    2f3a:	4886           	extw %d6
    2f3c:	3a06           	movew %d6,%d5
    2f3e:	48c5           	extl %d5
    2f40:	1e00           	moveb %d0,%d7
    2f42:	0207 0010      	andib #16,%d7
    2f46:	1f47 0036      	moveb %d7,%sp@(54)
    2f4a:	0800 0004      	btst #4,%d0
    2f4e:	6600 06b2      	bnew 0x3602
    2f52:	4a04           	tstb %d4
    2f54:	6f02           	bles 0x2f58
    2f56:	cbc6           	mulsw %d6,%d5
    2f58:	700a           	moveq #10,%d0
    2f5a:	e1ad           	lsll %d0,%d5
    2f5c:	1f6d 0018 0055 	moveb %a5@(24),%sp@(85)
    2f62:	780f           	moveq #15,%d4
    2f64:	e9aa           	lsll %d4,%d2
    2f66:	700f           	moveq #15,%d0
    2f68:	9081           	subl %d1,%d0
    2f6a:	e788           	lsll #3,%d0
    2f6c:	2640           	moveal %d0,%a3
    2f6e:	7e00           	moveq #0,%d7
    2f70:	1e2d 0013      	moveb %a5@(19),%d7
    2f74:	7c0b           	moveq #11,%d6
    2f76:	edaf           	lsll %d6,%d7
    2f78:	7200           	moveq #0,%d1
    2f7a:	122f 004b      	moveb %sp@(75),%d1
    2f7e:	2f41 003e      	movel %d1,%sp@(62)
    2f82:	7c00           	moveq #0,%d6
    2f84:	1c2d 0016      	moveb %a5@(22),%d6
    2f88:	2001           	movel %d1,%d0
    2f8a:	780e           	moveq #14,%d4
    2f8c:	e9a8           	lsll %d4,%d0
    2f8e:	2f0b           	movel %a3,%sp@-
    2f90:	2f00           	movel %d0,%sp@-
    2f92:	2f48 0032      	movel %a0,%sp@(50)
    2f96:	226f 003a      	moveal %sp@(58),%a1
    2f9a:	4e91           	jsr %a1@
    2f9c:	508f           	addql #8,%sp
    2f9e:	2800           	movel %d0,%d4
    2fa0:	e084           	asrl #8,%d4
    2fa2:	700e           	moveq #14,%d0
    2fa4:	e1ae           	lsll %d0,%d6
    2fa6:	2f0b           	movel %a3,%sp@-
    2fa8:	2f06           	movel %d6,%sp@-
    2faa:	226f 003a      	moveal %sp@(58),%a1
    2fae:	4e91           	jsr %a1@
    2fb0:	508f           	addql #8,%sp
    2fb2:	e080           	asrl #8,%d0
    2fb4:	2640           	moveal %d0,%a3
    2fb6:	206f 002a      	moveal %sp@(42),%a0
    2fba:	b084           	cmpl %d4,%d0
    2fbc:	6c00 0656      	bgew 0x3614
    2fc0:	4487           	negl %d7
    2fc2:	2f40 003a      	movel %d0,%sp@(58)
    2fc6:	2644           	moveal %d4,%a3
    2fc8:	7000           	moveq #0,%d0
    2fca:	102f 0054      	moveb %sp@(84),%d0
    2fce:	2f0a           	movel %a2,%sp@-
    2fd0:	2f00           	movel %d0,%sp@-
    2fd2:	2f48 0032      	movel %a0,%sp@(50)
    2fd6:	226f 003a      	moveal %sp@(58),%a1
    2fda:	4e91           	jsr %a1@
    2fdc:	588f           	addql #4,%sp
    2fde:	2e80           	movel %d0,%sp@
    2fe0:	202f 0062      	movel %sp@(98),%d0
    2fe4:	d0af 0032      	addl %sp@(50),%d0
    2fe8:	2f00           	movel %d0,%sp@-
    2fea:	226f 003a      	moveal %sp@(58),%a1
    2fee:	4e91           	jsr %a1@
    2ff0:	508f           	addql #8,%sp
    2ff2:	2c00           	movel %d0,%d6
    2ff4:	2f0a           	movel %a2,%sp@-
    2ff6:	2f2f 0042      	movel %sp@(66),%sp@-
    2ffa:	226f 003a      	moveal %sp@(58),%a1
    2ffe:	4e91           	jsr %a1@
    3000:	508f           	addql #8,%sp
    3002:	2206           	movel %d6,%d1
    3004:	d280           	addl %d0,%d1
    3006:	206f 002a      	moveal %sp@(42),%a0
    300a:	b282           	cmpl %d2,%d1
    300c:	6f06           	bles 0x3014
    300e:	9282           	subl %d2,%d1
    3010:	b282           	cmpl %d2,%d1
    3012:	6efa           	bgts 0x300e
    3014:	bcfc 0000      	cmpaw #0,%fp
    3018:	6700 07aa      	beqw 0x37c4
    301c:	4aaf 005a      	tstl %sp@(90)
    3020:	6700 0912      	beqw 0x3934
    3024:	200a           	movel %a2,%d0
    3026:	262f 0072      	movel %sp@(114),%d3
    302a:	e6a0           	asrl %d3,%d0
    302c:	41f2 0800      	lea %a2@(0,%d0:l),%a0
    3030:	4aaf 0042      	tstl %sp@(66)
    3034:	6700 008e      	beqw 0x30c4
    3038:	4240           	clrw %d0
    303a:	102f 0055      	moveb %sp@(85),%d0
    303e:	226f 004e      	moveal %sp@(78),%a1
    3042:	7600           	moveq #0,%d3
    3044:	4a2f 0036      	tstb %sp@(54)
    3048:	6600 062a      	bnew 0x3674
    304c:	2f4d 003e      	movel %a5,%sp@(62)
    3050:	3f40 0036      	movew %d0,%sp@(54)
    3054:	2003           	movel %d3,%d0
    3056:	2a6f 006a      	moveal %sp@(106),%a5
    305a:	2601           	movel %d1,%d3
    305c:	9684           	subl %d4,%d3
    305e:	6b00 049a      	bmiw 0x34fa
    3062:	7c0f           	moveq #15,%d6
    3064:	eca3           	asrl %d6,%d3
    3066:	1636 3800      	moveb %fp@(0,%d3:l),%d3
    306a:	4883           	extw %d3
    306c:	48c3           	extl %d3
    306e:	c7ef 0036      	mulsw %sp@(54),%d3
    3072:	ee83           	asrl #7,%d3
    3074:	1c11           	moveb %a1@,%d6
    3076:	4886           	extw %d6
    3078:	dc43           	addw %d3,%d6
    307a:	0c46 0080      	cmpiw #128,%d6
    307e:	6d00 0446      	bltw 0x34c6
    3082:	7c7f           	moveq #127,%d6
    3084:	12c6           	moveb %d6,%a1@+
    3086:	d288           	addl %a0,%d1
    3088:	b282           	cmpl %d2,%d1
    308a:	6d18           	blts 0x30a4
    308c:	9282           	subl %d2,%d1
    308e:	d887           	addl %d7,%d4
    3090:	b88b           	cmpl %a3,%d4
    3092:	6d04           	blts 0x3098
    3094:	4487           	negl %d7
    3096:	280b           	movel %a3,%d4
    3098:	b8af 003a      	cmpl %sp@(58),%d4
    309c:	6e06           	bgts 0x30a4
    309e:	4487           	negl %d7
    30a0:	282f 003a      	movel %sp@(58),%d4
    30a4:	4a85           	tstl %d5
    30a6:	6714           	beqs 0x30bc
    30a8:	d085           	addl %d5,%d0
    30aa:	2600           	movel %d0,%d3
    30ac:	7c0a           	moveq #10,%d6
    30ae:	eca3           	asrl %d6,%d3
    30b0:	41f2 3800      	lea %a2@(0,%d3:l),%a0
    30b4:	b1c2           	cmpal %d2,%a0
    30b6:	6504           	bcss 0x30bc
    30b8:	7a00           	moveq #0,%d5
    30ba:	91c8           	subal %a0,%a0
    30bc:	b3cd           	cmpal %a5,%a1
    30be:	669a           	bnes 0x305a
    30c0:	2a6f 003e      	moveal %sp@(62),%a5
    30c4:	52af 002e      	addql #1,%sp@(46)
    30c8:	7c04           	moveq #4,%d6
    30ca:	bcaf 002e      	cmpl %sp@(46),%d6
    30ce:	6600 fd94      	bnew 0x2e64
    30d2:	4a2f 0077      	tstb %sp@(119)
    30d6:	6710           	beqs 0x30e8
    30d8:	bcfc 0000      	cmpaw #0,%fp
    30dc:	670a           	beqs 0x30e8
    30de:	7e01           	moveq #1,%d7
    30e0:	beaf 005a      	cmpl %sp@(90),%d7
    30e4:	6600 0202      	bnew 0x32e8
    30e8:	2c4d           	moveal %a5,%fp
    30ea:	122d 001f      	moveb %a5@(31),%d1
    30ee:	6700 084a      	beqw 0x393a
    30f2:	102d 0025      	moveb %a5@(37),%d0
    30f6:	4880           	extw %d0
    30f8:	48c0           	extl %d0
    30fa:	ef88           	lsll #7,%d0
    30fc:	2f40 0032      	movel %d0,%sp@(50)
    3100:	7000           	moveq #0,%d0
    3102:	102d 0022      	moveb %a5@(34),%d0
    3106:	e188           	lsll #8,%d0
    3108:	2a40           	moveal %d0,%a5
    310a:	7000           	moveq #0,%d0
    310c:	102e 0023      	moveb %fp@(35),%d0
    3110:	e188           	lsll #8,%d0
    3112:	2f40 0036      	movel %d0,%sp@(54)
    3116:	7000           	moveq #0,%d0
    3118:	102e 0024      	moveb %fp@(36),%d0
    311c:	e188           	lsll #8,%d0
    311e:	2f40 003a      	movel %d0,%sp@(58)
    3122:	4aaf 0042      	tstl %sp@(66)
    3126:	6700 0812      	beqw 0x393a
    312a:	367c 0040      	moveaw #64,%a3
    312e:	d7ef 004e      	addal %sp@(78),%a3
    3132:	202f 0036      	movel %sp@(54),%d0
    3136:	e080           	asrl #8,%d0
    3138:	4600           	notb %d0
    313a:	1f40 0054      	moveb %d0,%sp@(84)
    313e:	4242           	clrw %d2
    3140:	1400           	moveb %d0,%d2
    3142:	3f42 0052      	movew %d2,%sp@(82)
    3146:	202f 003a      	movel %sp@(58),%d0
    314a:	e080           	asrl #8,%d0
    314c:	4600           	notb %d0
    314e:	1f40 004b      	moveb %d0,%sp@(75)
    3152:	4243           	clrw %d3
    3154:	1600           	moveb %d0,%d3
    3156:	3f43 004c      	movew %d3,%sp@(76)
    315a:	4244           	clrw %d4
    315c:	4246           	clrw %d6
    315e:	4243           	clrw %d3
    3160:	4242           	clrw %d2
    3162:	7ec0           	moveq #-64,%d7
    3164:	9eaf 004e      	subl %sp@(78),%d7
    3168:	2f47 003e      	movel %d7,%sp@(62)
    316c:	3f42 005a      	movew %d2,%sp@(90)
    3170:	2e2f 0032      	movel %sp@(50),%d7
    3174:	de8d           	addl %a5,%d7
    3176:	4aaf 0032      	tstl %sp@(50)
    317a:	6f00 0120      	blew 0x329c
    317e:	bbef 003a      	cmpal %sp@(58),%a5
    3182:	6e00 077e      	bgtw 0x3902
    3186:	beaf 003a      	cmpl %sp@(58),%d7
    318a:	6d00 078e      	bltw 0x391a
    318e:	242f 0036      	movel %sp@(54),%d2
    3192:	b4af 003a      	cmpl %sp@(58),%d2
    3196:	6700 0e5c      	beqw 0x3ff4
    319a:	44af 0032      	negl %sp@(50)
    319e:	3a2f 004c      	movew %sp@(76),%d5
    31a2:	102f 004b      	moveb %sp@(75),%d0
    31a6:	2a6f 003a      	moveal %sp@(58),%a5
    31aa:	142e 0020      	moveb %fp@(32),%d2
    31ae:	3042           	moveaw %d2,%a0
    31b0:	45eb ffc0      	lea %a3@(-64),%a2
    31b4:	0c01 0002      	cmpib #2,%d1
    31b8:	6700 011e      	beqw 0x32d8
    31bc:	0c01 0004      	cmpib #4,%d1
    31c0:	6700 0116      	beqw 0x32d8
    31c4:	3e05           	movew %d5,%d7
    31c6:	3005           	movew %d5,%d0
    31c8:	48c0           	extl %d0
    31ca:	3408           	movew %a0,%d2
    31cc:	4a02           	tstb %d2
    31ce:	6730           	beqs 0x3200
    31d0:	e188           	lsll #8,%d0
    31d2:	0242 00ff      	andiw #255,%d2
    31d6:	3042           	moveaw %d2,%a0
    31d8:	d0c2           	addaw %d2,%a0
    31da:	327c 00b6      	moveaw #182,%a1
    31de:	92c8           	subaw %a0,%a1
    31e0:	7436           	moveq #54,%d2
    31e2:	b449           	cmpw %a1,%d2
    31e4:	6f04           	bles 0x31ea
    31e6:	327c 0036      	moveaw #54,%a1
    31ea:	3249           	moveaw %a1,%a1
    31ec:	2f09           	movel %a1,%sp@-
    31ee:	2f00           	movel %d0,%sp@-
    31f0:	2f41 0032      	movel %d1,%sp@(50)
    31f4:	206f 004e      	moveal %sp@(78),%a0
    31f8:	4e90           	jsr %a0@
    31fa:	508f           	addql #8,%sp
    31fc:	222f 002a      	movel %sp@(42),%d1
    3200:	de40           	addw %d0,%d7
    3202:	0287 0000 ffff 	andil #65535,%d7
    3208:	0c01 0001      	cmpib #1,%d1
    320c:	6700 0506      	beqw 0x3714
    3210:	2047           	moveal %d7,%a0
    3212:	1e01           	moveb %d1,%d7
    3214:	342f 005a      	movew %sp@(90),%d2
    3218:	3202           	movew %d2,%d1
    321a:	9243           	subw %d3,%d1
    321c:	2008           	movel %a0,%d0
    321e:	c1c1           	mulsw %d1,%d0
    3220:	121a           	moveb %a2@+,%d1
    3222:	4881           	extw %d1
    3224:	e080           	asrl #8,%d0
    3226:	9042           	subw %d2,%d0
    3228:	d041           	addw %d1,%d0
    322a:	48c0           	extl %d0
    322c:	c1c5           	mulsw %d5,%d0
    322e:	e080           	asrl #8,%d0
    3230:	d440           	addw %d0,%d2
    3232:	3002           	movew %d2,%d0
    3234:	9043           	subw %d3,%d0
    3236:	48c0           	extl %d0
    3238:	c1c5           	mulsw %d5,%d0
    323a:	e080           	asrl #8,%d0
    323c:	d640           	addw %d0,%d3
    323e:	3003           	movew %d3,%d0
    3240:	9046           	subw %d6,%d0
    3242:	48c0           	extl %d0
    3244:	c1c5           	mulsw %d5,%d0
    3246:	e080           	asrl #8,%d0
    3248:	dc40           	addw %d0,%d6
    324a:	3006           	movew %d6,%d0
    324c:	9044           	subw %d4,%d0
    324e:	48c0           	extl %d0
    3250:	c1c5           	mulsw %d5,%d0
    3252:	e080           	asrl #8,%d0
    3254:	d840           	addw %d0,%d4
    3256:	0c07 0002      	cmpib #2,%d7
    325a:	6600 0278      	bnew 0x34d4
    325e:	3004           	movew %d4,%d0
    3260:	9041           	subw %d1,%d0
    3262:	0c40 ff7f      	cmpiw #-129,%d0
    3266:	6e00 0246      	bgtw 0x34ae
    326a:	7080           	moveq #-128,%d0
    326c:	1540 ffff      	moveb %d0,%a2@(-1)
    3270:	b7ca           	cmpal %a2,%a3
    3272:	66a4           	bnes 0x3218
    3274:	3f42 005a      	movew %d2,%sp@(90)
    3278:	47eb 0040      	lea %a3@(64),%a3
    327c:	202f 003e      	movel %sp@(62),%d0
    3280:	d08b           	addl %a3,%d0
    3282:	b0af 0042      	cmpl %sp@(66),%d0
    3286:	6400 06b2      	bccw 0x393a
    328a:	122e 001f      	moveb %fp@(31),%d1
    328e:	2e2f 0032      	movel %sp@(50),%d7
    3292:	de8d           	addl %a5,%d7
    3294:	4aaf 0032      	tstl %sp@(50)
    3298:	6e00 fee4      	bgtw 0x317e
    329c:	bbef 0036      	cmpal %sp@(54),%a5
    32a0:	6d00 0ac6      	bltw 0x3d68
    32a4:	beaf 0036      	cmpl %sp@(54),%d7
    32a8:	6e00 0ac6      	bgtw 0x3d70
    32ac:	2e2f 0036      	movel %sp@(54),%d7
    32b0:	beaf 003a      	cmpl %sp@(58),%d7
    32b4:	6700 0d9c      	beqw 0x4052
    32b8:	44af 0032      	negl %sp@(50)
    32bc:	3a2f 0052      	movew %sp@(82),%d5
    32c0:	102f 0054      	moveb %sp@(84),%d0
    32c4:	2a47           	moveal %d7,%a5
    32c6:	142e 0020      	moveb %fp@(32),%d2
    32ca:	3042           	moveaw %d2,%a0
    32cc:	45eb ffc0      	lea %a3@(-64),%a2
    32d0:	0c01 0002      	cmpib #2,%d1
    32d4:	6600 fee6      	bnew 0x31bc
    32d8:	0240 00ff      	andiw #255,%d0
    32dc:	3e3c 00ff      	movew #255,%d7
    32e0:	9e40           	subw %d0,%d7
    32e2:	3a07           	movew %d7,%d5
    32e4:	6000 fee0      	braw 0x31c6
    32e8:	7201           	moveq #1,%d1
    32ea:	2f41 005a      	movel %d1,%sp@(90)
    32ee:	42af 002e      	clrl %sp@(46)
    32f2:	41fa 0e18      	lea %pc@(0x410c),%a0
    32f6:	2f48 0032      	movel %a0,%sp@(50)
    32fa:	6000 fb68      	braw 0x2e64
    32fe:	41fa 11e2      	lea %pc@(0x44e2),%a0
    3302:	43fa 165e      	lea %pc@(0x4962),%a1
    3306:	7400           	moveq #0,%d2
    3308:	3412           	movew %a2@,%d2
    330a:	2002           	movel %d2,%d0
    330c:	4840           	swap %d0
    330e:	4240           	clrw %d0
    3310:	7400           	moveq #0,%d2
    3312:	3428 001e      	movew %a0@(30),%d2
    3316:	2202           	movel %d2,%d1
    3318:	4841           	swap %d1
    331a:	4241           	clrw %d1
    331c:	9280           	subl %d0,%d1
    331e:	e881           	asrl #4,%d1
    3320:	d081           	addl %d1,%d0
    3322:	2600           	movel %d0,%d3
    3324:	4843           	swap %d3
    3326:	48c3           	extl %d3
    3328:	3083           	movew %d3,%a0@
    332a:	d081           	addl %d1,%d0
    332c:	2600           	movel %d0,%d3
    332e:	4843           	swap %d3
    3330:	48c3           	extl %d3
    3332:	3143 0002      	movew %d3,%a0@(2)
    3336:	d081           	addl %d1,%d0
    3338:	2600           	movel %d0,%d3
    333a:	4843           	swap %d3
    333c:	48c3           	extl %d3
    333e:	3143 0004      	movew %d3,%a0@(4)
    3342:	d081           	addl %d1,%d0
    3344:	2600           	movel %d0,%d3
    3346:	4843           	swap %d3
    3348:	48c3           	extl %d3
    334a:	3143 0006      	movew %d3,%a0@(6)
    334e:	d081           	addl %d1,%d0
    3350:	2600           	movel %d0,%d3
    3352:	4843           	swap %d3
    3354:	48c3           	extl %d3
    3356:	3143 0008      	movew %d3,%a0@(8)
    335a:	d081           	addl %d1,%d0
    335c:	2600           	movel %d0,%d3
    335e:	4843           	swap %d3
    3360:	48c3           	extl %d3
    3362:	3143 000a      	movew %d3,%a0@(10)
    3366:	d081           	addl %d1,%d0
    3368:	2600           	movel %d0,%d3
    336a:	4843           	swap %d3
    336c:	48c3           	extl %d3
    336e:	3143 000c      	movew %d3,%a0@(12)
    3372:	d081           	addl %d1,%d0
    3374:	2600           	movel %d0,%d3
    3376:	4843           	swap %d3
    3378:	48c3           	extl %d3
    337a:	3143 000e      	movew %d3,%a0@(14)
    337e:	d081           	addl %d1,%d0
    3380:	2600           	movel %d0,%d3
    3382:	4843           	swap %d3
    3384:	48c3           	extl %d3
    3386:	3143 0010      	movew %d3,%a0@(16)
    338a:	d081           	addl %d1,%d0
    338c:	2600           	movel %d0,%d3
    338e:	4843           	swap %d3
    3390:	48c3           	extl %d3
    3392:	3143 0012      	movew %d3,%a0@(18)
    3396:	d081           	addl %d1,%d0
    3398:	2600           	movel %d0,%d3
    339a:	4843           	swap %d3
    339c:	48c3           	extl %d3
    339e:	3143 0014      	movew %d3,%a0@(20)
    33a2:	d081           	addl %d1,%d0
    33a4:	2600           	movel %d0,%d3
    33a6:	4843           	swap %d3
    33a8:	48c3           	extl %d3
    33aa:	3143 0016      	movew %d3,%a0@(22)
    33ae:	d081           	addl %d1,%d0
    33b0:	2600           	movel %d0,%d3
    33b2:	4843           	swap %d3
    33b4:	48c3           	extl %d3
    33b6:	3143 0018      	movew %d3,%a0@(24)
    33ba:	d081           	addl %d1,%d0
    33bc:	2600           	movel %d0,%d3
    33be:	4843           	swap %d3
    33c0:	48c3           	extl %d3
    33c2:	3143 001a      	movew %d3,%a0@(26)
    33c6:	d280           	addl %d0,%d1
    33c8:	4841           	swap %d1
    33ca:	48c1           	extl %d1
    33cc:	3141 001c      	movew %d1,%a0@(28)
    33d0:	41e8 0020      	lea %a0@(32),%a0
    33d4:	b3c8           	cmpal %a0,%a1
    33d6:	6700 f4ba      	beqw 0x2892
    33da:	2002           	movel %d2,%d0
    33dc:	4840           	swap %d0
    33de:	4240           	clrw %d0
    33e0:	7400           	moveq #0,%d2
    33e2:	3428 001e      	movew %a0@(30),%d2
    33e6:	2202           	movel %d2,%d1
    33e8:	4841           	swap %d1
    33ea:	4241           	clrw %d1
    33ec:	9280           	subl %d0,%d1
    33ee:	e881           	asrl #4,%d1
    33f0:	d081           	addl %d1,%d0
    33f2:	2600           	movel %d0,%d3
    33f4:	4843           	swap %d3
    33f6:	48c3           	extl %d3
    33f8:	3083           	movew %d3,%a0@
    33fa:	d081           	addl %d1,%d0
    33fc:	2600           	movel %d0,%d3
    33fe:	4843           	swap %d3
    3400:	48c3           	extl %d3
    3402:	3143 0002      	movew %d3,%a0@(2)
    3406:	d081           	addl %d1,%d0
    3408:	2600           	movel %d0,%d3
    340a:	4843           	swap %d3
    340c:	48c3           	extl %d3
    340e:	3143 0004      	movew %d3,%a0@(4)
    3412:	d081           	addl %d1,%d0
    3414:	2600           	movel %d0,%d3
    3416:	4843           	swap %d3
    3418:	48c3           	extl %d3
    341a:	3143 0006      	movew %d3,%a0@(6)
    341e:	d081           	addl %d1,%d0
    3420:	2600           	movel %d0,%d3
    3422:	4843           	swap %d3
    3424:	48c3           	extl %d3
    3426:	3143 0008      	movew %d3,%a0@(8)
    342a:	d081           	addl %d1,%d0
    342c:	2600           	movel %d0,%d3
    342e:	4843           	swap %d3
    3430:	48c3           	extl %d3
    3432:	3143 000a      	movew %d3,%a0@(10)
    3436:	d081           	addl %d1,%d0
    3438:	2600           	movel %d0,%d3
    343a:	4843           	swap %d3
    343c:	48c3           	extl %d3
    343e:	3143 000c      	movew %d3,%a0@(12)
    3442:	d081           	addl %d1,%d0
    3444:	2600           	movel %d0,%d3
    3446:	4843           	swap %d3
    3448:	48c3           	extl %d3
    344a:	3143 000e      	movew %d3,%a0@(14)
    344e:	d081           	addl %d1,%d0
    3450:	2600           	movel %d0,%d3
    3452:	4843           	swap %d3
    3454:	48c3           	extl %d3
    3456:	3143 0010      	movew %d3,%a0@(16)
    345a:	d081           	addl %d1,%d0
    345c:	2600           	movel %d0,%d3
    345e:	4843           	swap %d3
    3460:	48c3           	extl %d3
    3462:	3143 0012      	movew %d3,%a0@(18)
    3466:	d081           	addl %d1,%d0
    3468:	2600           	movel %d0,%d3
    346a:	4843           	swap %d3
    346c:	48c3           	extl %d3
    346e:	3143 0014      	movew %d3,%a0@(20)
    3472:	d081           	addl %d1,%d0
    3474:	2600           	movel %d0,%d3
    3476:	4843           	swap %d3
    3478:	48c3           	extl %d3
    347a:	3143 0016      	movew %d3,%a0@(22)
    347e:	d081           	addl %d1,%d0
    3480:	2600           	movel %d0,%d3
    3482:	4843           	swap %d3
    3484:	48c3           	extl %d3
    3486:	3143 0018      	movew %d3,%a0@(24)
    348a:	d081           	addl %d1,%d0
    348c:	2600           	movel %d0,%d3
    348e:	4843           	swap %d3
    3490:	48c3           	extl %d3
    3492:	3143 001a      	movew %d3,%a0@(26)
    3496:	d280           	addl %d0,%d1
    3498:	4841           	swap %d1
    349a:	48c1           	extl %d1
    349c:	3141 001c      	movew %d1,%a0@(28)
    34a0:	41e8 0020      	lea %a0@(32),%a0
    34a4:	b3c8           	cmpal %a0,%a1
    34a6:	6600 fe62      	bnew 0x330a
    34aa:	6000 f3e6      	braw 0x2892
    34ae:	0c40 0080      	cmpiw #128,%d0
    34b2:	6d00 fdb8      	bltw 0x326c
    34b6:	707f           	moveq #127,%d0
    34b8:	1540 ffff      	moveb %d0,%a2@(-1)
    34bc:	b7ca           	cmpal %a2,%a3
    34be:	6600 fd58      	bnew 0x3218
    34c2:	6000 fdb0      	braw 0x3274
    34c6:	0c46 ff7f      	cmpiw #-129,%d6
    34ca:	6e00 fbb8      	bgtw 0x3084
    34ce:	7c80           	moveq #-128,%d6
    34d0:	6000 fbb2      	braw 0x3084
    34d4:	0c07 0003      	cmpib #3,%d7
    34d8:	6610           	bnes 0x34ea
    34da:	3244           	moveaw %d4,%a1
    34dc:	92c6           	subaw %d6,%a1
    34de:	92c3           	subaw %d3,%a1
    34e0:	92c2           	subaw %d2,%a1
    34e2:	2009           	movel %a1,%d0
    34e4:	e280           	asrl #1,%d0
    34e6:	6000 fd7a      	braw 0x3262
    34ea:	0c07 0004      	cmpib #4,%d7
    34ee:	6600 0bfa      	bnew 0x40ea
    34f2:	3002           	movew %d2,%d0
    34f4:	9044           	subw %d4,%d0
    34f6:	6000 fd6a      	braw 0x3262
    34fa:	1616           	moveb %fp@,%d3
    34fc:	4883           	extw %d3
    34fe:	6000 fb6c      	braw 0x306c
    3502:	b0fc 0000      	cmpaw #0,%a0
    3506:	6c00 0bf2      	bgew 0x40fa
    350a:	45e8 000c      	lea %a0@(12),%a2
    350e:	b4fc 0000      	cmpaw #0,%a2
    3512:	6c00 0872      	bgew 0x3d86
    3516:	45e8 0018      	lea %a0@(24),%a2
    351a:	b4fc 0000      	cmpaw #0,%a2
    351e:	6c00 0878      	bgew 0x3d98
    3522:	45e8 0024      	lea %a0@(36),%a2
    3526:	b4fc 0000      	cmpaw #0,%a2
    352a:	6c00 0914      	bgew 0x3e40
    352e:	45e8 0030      	lea %a0@(48),%a2
    3532:	b4fc 0000      	cmpaw #0,%a2
    3536:	6c00 090e      	bgew 0x3e46
    353a:	45e8 003c      	lea %a0@(60),%a2
    353e:	b4fc 0000      	cmpaw #0,%a2
    3542:	6c00 0914      	bgew 0x3e58
    3546:	45e8 0048      	lea %a0@(72),%a2
    354a:	b4fc 0000      	cmpaw #0,%a2
    354e:	6c00 090e      	bgew 0x3e5e
    3552:	45e8 0054      	lea %a0@(84),%a2
    3556:	b4fc 0000      	cmpaw #0,%a2
    355a:	6c00 0914      	bgew 0x3e70
    355e:	45e8 0060      	lea %a0@(96),%a2
    3562:	b4fc 0000      	cmpaw #0,%a2
    3566:	6c00 0a86      	bgew 0x3fee
    356a:	45e8 006c      	lea %a0@(108),%a2
    356e:	b4fc 0000      	cmpaw #0,%a2
    3572:	6c00 0a9a      	bgew 0x400e
    3576:	45e8 0078      	lea %a0@(120),%a2
    357a:	b4fc 0000      	cmpaw #0,%a2
    357e:	6c00 0acc      	bgew 0x404c
    3582:	45e8 0084      	lea %a0@(132),%a2
    3586:	76f5           	moveq #-11,%d3
    3588:	43f2 a800      	lea %a2@(0,%a2:l),%a1
    358c:	d3ca           	addal %a2,%a1
    358e:	2209           	movel %a1,%d1
    3590:	ef89           	lsll #7,%d1
    3592:	2241           	moveal %d1,%a1
    3594:	d3ca           	addal %a2,%a1
    3596:	d3ef 0062      	addal %sp@(98),%a1
    359a:	102d 0014      	moveb %a5@(20),%d0
    359e:	1200           	moveb %d0,%d1
    35a0:	0201 0003      	andib #3,%d1
    35a4:	6700 f966      	beqw 0x2f0c
    35a8:	0c01 0001      	cmpib #1,%d1
    35ac:	6600 00b6      	bnew 0x3664
    35b0:	4de9 0100      	lea %a1@(256),%fp
    35b4:	3203           	movew %d3,%d1
    35b6:	48c1           	extl %d1
    35b8:	4a43           	tstw %d3
    35ba:	6e00 f95c      	bgtw 0x2f18
    35be:	4a43           	tstw %d3
    35c0:	6700 0b40      	beqw 0x4102
    35c4:	2401           	movel %d1,%d2
    35c6:	4482           	negl %d2
    35c8:	283c 0000 8000 	movel #32768,%d4
    35ce:	e4a4           	asrl %d2,%d4
    35d0:	2444           	moveal %d4,%a2
    35d2:	1f6d 0015 004b 	moveb %a5@(21),%sp@(75)
    35d8:	1f6d 0011 0054 	moveb %a5@(17),%sp@(84)
    35de:	7400           	moveq #0,%d2
    35e0:	1429 0180      	moveb %a1@(384),%d2
    35e4:	182d 0021      	moveb %a5@(33),%d4
    35e8:	1c04           	moveb %d4,%d6
    35ea:	4886           	extw %d6
    35ec:	3a06           	movew %d6,%d5
    35ee:	48c5           	extl %d5
    35f0:	1e00           	moveb %d0,%d7
    35f2:	0207 0010      	andib #16,%d7
    35f6:	1f47 0036      	moveb %d7,%sp@(54)
    35fa:	0800 0004      	btst #4,%d0
    35fe:	6700 f952      	beqw 0x2f52
    3602:	4a04           	tstb %d4
    3604:	6f00 0752      	blew 0x3d58
    3608:	1f7c 0001 0036 	moveb #1,%sp@(54)
    360e:	cbc6           	mulsw %d6,%d5
    3610:	6000 f946      	braw 0x2f58
    3614:	2f44 003a      	movel %d4,%sp@(58)
    3618:	7000           	moveq #0,%d0
    361a:	102f 0054      	moveb %sp@(84),%d0
    361e:	2f0a           	movel %a2,%sp@-
    3620:	2f00           	movel %d0,%sp@-
    3622:	2f48 0032      	movel %a0,%sp@(50)
    3626:	226f 003a      	moveal %sp@(58),%a1
    362a:	4e91           	jsr %a1@
    362c:	588f           	addql #4,%sp
    362e:	2e80           	movel %d0,%sp@
    3630:	202f 0062      	movel %sp@(98),%d0
    3634:	d0af 0032      	addl %sp@(50),%d0
    3638:	2f00           	movel %d0,%sp@-
    363a:	226f 003a      	moveal %sp@(58),%a1
    363e:	4e91           	jsr %a1@
    3640:	508f           	addql #8,%sp
    3642:	2c00           	movel %d0,%d6
    3644:	2f0a           	movel %a2,%sp@-
    3646:	2f2f 0042      	movel %sp@(66),%sp@-
    364a:	226f 003a      	moveal %sp@(58),%a1
    364e:	4e91           	jsr %a1@
    3650:	508f           	addql #8,%sp
    3652:	2206           	movel %d6,%d1
    3654:	d280           	addl %d0,%d1
    3656:	206f 002a      	moveal %sp@(42),%a0
    365a:	b282           	cmpl %d2,%d1
    365c:	6e00 f9b0      	bgtw 0x300e
    3660:	6000 f9b2      	braw 0x3014
    3664:	0c01 0002      	cmpib #2,%d1
    3668:	6600 f8a4      	bnew 0x2f0e
    366c:	4de9 0080      	lea %a1@(128),%fp
    3670:	6000 f89c      	braw 0x2f0e
    3674:	2f4d 003e      	movel %a5,%sp@(62)
    3678:	3f40 0036      	movew %d0,%sp@(54)
    367c:	2003           	movel %d3,%d0
    367e:	2a6f 006a      	moveal %sp@(106),%a5
    3682:	2601           	movel %d1,%d3
    3684:	9684           	subl %d4,%d3
    3686:	6b6a           	bmis 0x36f2
    3688:	7c0f           	moveq #15,%d6
    368a:	eca3           	asrl %d6,%d3
    368c:	1636 3800      	moveb %fp@(0,%d3:l),%d3
    3690:	4883           	extw %d3
    3692:	48c3           	extl %d3
    3694:	c7ef 0036      	mulsw %sp@(54),%d3
    3698:	1c11           	moveb %a1@,%d6
    369a:	4886           	extw %d6
    369c:	ee83           	asrl #7,%d3
    369e:	dc43           	addw %d3,%d6
    36a0:	0c46 0080      	cmpiw #128,%d6
    36a4:	6d64           	blts 0x370a
    36a6:	7c7f           	moveq #127,%d6
    36a8:	12c6           	moveb %d6,%a1@+
    36aa:	d288           	addl %a0,%d1
    36ac:	b282           	cmpl %d2,%d1
    36ae:	6d18           	blts 0x36c8
    36b0:	9282           	subl %d2,%d1
    36b2:	d887           	addl %d7,%d4
    36b4:	b7c4           	cmpal %d4,%a3
    36b6:	6e04           	bgts 0x36bc
    36b8:	4487           	negl %d7
    36ba:	280b           	movel %a3,%d4
    36bc:	b8af 003a      	cmpl %sp@(58),%d4
    36c0:	6e06           	bgts 0x36c8
    36c2:	4487           	negl %d7
    36c4:	282f 003a      	movel %sp@(58),%d4
    36c8:	4a85           	tstl %d5
    36ca:	671a           	beqs 0x36e6
    36cc:	d085           	addl %d5,%d0
    36ce:	2600           	movel %d0,%d3
    36d0:	7c0a           	moveq #10,%d6
    36d2:	eca3           	asrl %d6,%d3
    36d4:	41f2 3800      	lea %a2@(0,%d3:l),%a0
    36d8:	2605           	movel %d5,%d3
    36da:	ee83           	asrl #7,%d3
    36dc:	9a83           	subl %d3,%d5
    36de:	b1c2           	cmpal %d2,%a0
    36e0:	6504           	bcss 0x36e6
    36e2:	7a00           	moveq #0,%d5
    36e4:	91c8           	subal %a0,%a0
    36e6:	b3cd           	cmpal %a5,%a1
    36e8:	6700 f9d6      	beqw 0x30c0
    36ec:	2601           	movel %d1,%d3
    36ee:	9684           	subl %d4,%d3
    36f0:	6a96           	bpls 0x3688
    36f2:	1616           	moveb %fp@,%d3
    36f4:	4883           	extw %d3
    36f6:	48c3           	extl %d3
    36f8:	c7ef 0036      	mulsw %sp@(54),%d3
    36fc:	1c11           	moveb %a1@,%d6
    36fe:	4886           	extw %d6
    3700:	ee83           	asrl #7,%d3
    3702:	dc43           	addw %d3,%d6
    3704:	0c46 0080      	cmpiw #128,%d6
    3708:	6c9c           	bges 0x36a6
    370a:	0c46 ff7f      	cmpiw #-129,%d6
    370e:	6e98           	bgts 0x36a8
    3710:	7c80           	moveq #-128,%d6
    3712:	6094           	bras 0x36a8
    3714:	342f 005a      	movew %sp@(90),%d2
    3718:	3202           	movew %d2,%d1
    371a:	9243           	subw %d3,%d1
    371c:	2007           	movel %d7,%d0
    371e:	c1c1           	mulsw %d1,%d0
    3720:	e080           	asrl #8,%d0
    3722:	9042           	subw %d2,%d0
    3724:	121a           	moveb %a2@+,%d1
    3726:	4881           	extw %d1
    3728:	d041           	addw %d1,%d0
    372a:	48c0           	extl %d0
    372c:	c1c5           	mulsw %d5,%d0
    372e:	e080           	asrl #8,%d0
    3730:	d440           	addw %d0,%d2
    3732:	3002           	movew %d2,%d0
    3734:	9043           	subw %d3,%d0
    3736:	48c0           	extl %d0
    3738:	c1c5           	mulsw %d5,%d0
    373a:	e080           	asrl #8,%d0
    373c:	d640           	addw %d0,%d3
    373e:	3003           	movew %d3,%d0
    3740:	9046           	subw %d6,%d0
    3742:	48c0           	extl %d0
    3744:	c1c5           	mulsw %d5,%d0
    3746:	e080           	asrl #8,%d0
    3748:	dc40           	addw %d0,%d6
    374a:	3006           	movew %d6,%d0
    374c:	9044           	subw %d4,%d0
    374e:	48c0           	extl %d0
    3750:	c1c5           	mulsw %d5,%d0
    3752:	e080           	asrl #8,%d0
    3754:	d840           	addw %d0,%d4
    3756:	3004           	movew %d4,%d0
    3758:	0c44 ff7f      	cmpiw #-129,%d4
    375c:	6e52           	bgts 0x37b0
    375e:	7080           	moveq #-128,%d0
    3760:	1540 ffff      	moveb %d0,%a2@(-1)
    3764:	b7ca           	cmpal %a2,%a3
    3766:	6700 fb0c      	beqw 0x3274
    376a:	3202           	movew %d2,%d1
    376c:	9243           	subw %d3,%d1
    376e:	2007           	movel %d7,%d0
    3770:	c1c1           	mulsw %d1,%d0
    3772:	e080           	asrl #8,%d0
    3774:	9042           	subw %d2,%d0
    3776:	121a           	moveb %a2@+,%d1
    3778:	4881           	extw %d1
    377a:	d041           	addw %d1,%d0
    377c:	48c0           	extl %d0
    377e:	c1c5           	mulsw %d5,%d0
    3780:	e080           	asrl #8,%d0
    3782:	d440           	addw %d0,%d2
    3784:	3002           	movew %d2,%d0
    3786:	9043           	subw %d3,%d0
    3788:	48c0           	extl %d0
    378a:	c1c5           	mulsw %d5,%d0
    378c:	e080           	asrl #8,%d0
    378e:	d640           	addw %d0,%d3
    3790:	3003           	movew %d3,%d0
    3792:	9046           	subw %d6,%d0
    3794:	48c0           	extl %d0
    3796:	c1c5           	mulsw %d5,%d0
    3798:	e080           	asrl #8,%d0
    379a:	dc40           	addw %d0,%d6
    379c:	3006           	movew %d6,%d0
    379e:	9044           	subw %d4,%d0
    37a0:	48c0           	extl %d0
    37a2:	c1c5           	mulsw %d5,%d0
    37a4:	e080           	asrl #8,%d0
    37a6:	d840           	addw %d0,%d4
    37a8:	3004           	movew %d4,%d0
    37aa:	0c44 ff7f      	cmpiw #-129,%d4
    37ae:	6fae           	bles 0x375e
    37b0:	0c44 0080      	cmpiw #128,%d4
    37b4:	6daa           	blts 0x3760
    37b6:	707f           	moveq #127,%d0
    37b8:	1540 ffff      	moveb %d0,%a2@(-1)
    37bc:	b7ca           	cmpal %a2,%a3
    37be:	66aa           	bnes 0x376a
    37c0:	6000 fab2      	braw 0x3274
    37c4:	2c3c 0000 8000 	movel #32768,%d6
    37ca:	4a43           	tstw %d3
    37cc:	6d00 00ca      	bltw 0x3898
    37d0:	4aaf 0042      	tstl %sp@(66)
    37d4:	6700 f8ee      	beqw 0x30c4
    37d8:	4242           	clrw %d2
    37da:	142f 004b      	moveb %sp@(75),%d2
    37de:	4240           	clrw %d0
    37e0:	102f 0054      	moveb %sp@(84),%d0
    37e4:	d440           	addw %d0,%d2
    37e6:	5242           	addqw #1,%d2
    37e8:	2246           	moveal %d6,%a1
    37ea:	206f 004e      	moveal %sp@(78),%a0
    37ee:	4200           	clrb %d0
    37f0:	7600           	moveq #0,%d3
    37f2:	223c 0000 8000 	movel #32768,%d1
    37f8:	4247           	clrw %d7
    37fa:	1e2f 0055      	moveb %sp@(85),%d7
    37fe:	3f47 003a      	movew %d7,%sp@(58)
    3802:	246f 006a      	moveal %sp@(106),%a2
    3806:	0c81 0000 7fff 	cmpil #32767,%d1
    380c:	6e3c           	bgts 0x384a
    380e:	10c0           	moveb %d0,%a0@+
    3810:	d289           	addl %a1,%d1
    3812:	4a85           	tstl %d5
    3814:	6726           	beqs 0x383c
    3816:	d685           	addl %d5,%d3
    3818:	2803           	movel %d3,%d4
    381a:	7e0a           	moveq #10,%d7
    381c:	eea4           	asrl %d7,%d4
    381e:	2244           	moveal %d4,%a1
    3820:	d3c6           	addal %d6,%a1
    3822:	4a2f 0036      	tstb %sp@(54)
    3826:	6706           	beqs 0x382e
    3828:	2805           	movel %d5,%d4
    382a:	ee84           	asrl #7,%d4
    382c:	9a84           	subl %d4,%d5
    382e:	b2fc 01ff      	cmpaw #511,%a1
    3832:	6e08           	bgts 0x383c
    3834:	7a00           	moveq #0,%d5
    3836:	7200           	moveq #0,%d1
    3838:	327c 0200      	moveaw #512,%a1
    383c:	b1ca           	cmpal %a2,%a0
    383e:	6700 f884      	beqw 0x30c4
    3842:	0c81 0000 7fff 	cmpil #32767,%d1
    3848:	6fc4           	bles 0x380e
    384a:	3002           	movew %d2,%d0
    384c:	780d           	moveq #13,%d4
    384e:	e968           	lslw %d4,%d0
    3850:	b540           	eorw %d2,%d0
    3852:	3400           	movew %d0,%d2
    3854:	7e09           	moveq #9,%d7
    3856:	ee6a           	lsrw %d7,%d2
    3858:	b540           	eorw %d2,%d0
    385a:	3400           	movew %d0,%d2
    385c:	ef4a           	lslw #7,%d2
    385e:	b142           	eorw %d0,%d2
    3860:	0c81 0000 8000 	cmpil #32768,%d1
    3866:	6716           	beqs 0x387e
    3868:	2641           	moveal %d1,%a3
    386a:	47eb 8000      	lea %a3@(-32768),%a3
    386e:	2001           	movel %d1,%d0
    3870:	0680 ffff 7fff 	addil #-32769,%d0
    3876:	0240 8000      	andiw #-32768,%d0
    387a:	220b           	movel %a3,%d1
    387c:	9280           	subl %d0,%d1
    387e:	1002           	moveb %d2,%d0
    3880:	4880           	extw %d0
    3882:	48c0           	extl %d0
    3884:	c1ef 003a      	mulsw %sp@(58),%d0
    3888:	ee80           	asrl #7,%d0
    388a:	0c40 0080      	cmpiw #128,%d0
    388e:	6d64           	blts 0x38f4
    3890:	707f           	moveq #127,%d0
    3892:	d010           	addb %a0@,%d0
    3894:	6000 ff78      	braw 0x380e
    3898:	2408           	movel %a0,%d2
    389a:	4482           	negl %d2
    389c:	4878 000c      	pea 0xc
    38a0:	2f02           	movel %d2,%sp@-
    38a2:	206f 004e      	moveal %sp@(78),%a0
    38a6:	4e90           	jsr %a0@
    38a8:	508f           	addql #8,%sp
    38aa:	0c40 ffff      	cmpiw #-1,%d0
    38ae:	6700 07d0      	beqw 0x4080
    38b2:	e286           	asrl #1,%d6
    38b4:	51c8 fffc      	dbf %d0,0x38b2
    38b8:	4878 000c      	pea 0xc
    38bc:	2f06           	movel %d6,%sp@-
    38be:	226f 004e      	moveal %sp@(78),%a1
    38c2:	4e91           	jsr %a1@
    38c4:	508f           	addql #8,%sp
    38c6:	7600           	moveq #0,%d3
    38c8:	3600           	movew %d0,%d3
    38ca:	4878 000c      	pea 0xc
    38ce:	2f02           	movel %d2,%sp@-
    38d0:	41fa 08e2      	lea %pc@(0x41b4),%a0
    38d4:	4e90           	jsr %a0@
    38d6:	508f           	addql #8,%sp
    38d8:	0280 0000 ffff 	andil #65535,%d0
    38de:	2f03           	movel %d3,%sp@-
    38e0:	720c           	moveq #12,%d1
    38e2:	9280           	subl %d0,%d1
    38e4:	2f01           	movel %d1,%sp@-
    38e6:	206f 003a      	moveal %sp@(58),%a0
    38ea:	4e90           	jsr %a0@
    38ec:	508f           	addql #8,%sp
    38ee:	dc80           	addl %d0,%d6
    38f0:	6000 fede      	braw 0x37d0
    38f4:	0c40 ff7f      	cmpiw #-129,%d0
    38f8:	6e98           	bgts 0x3892
    38fa:	7080           	moveq #-128,%d0
    38fc:	d010           	addb %a0@,%d0
    38fe:	6000 ff0e      	braw 0x380e
    3902:	bbfc 0000 ff00 	cmpal #65280,%a5
    3908:	6f10           	bles 0x391a
    390a:	2007           	movel %d7,%d0
    390c:	e080           	asrl #8,%d0
    390e:	4600           	notb %d0
    3910:	4245           	clrw %d5
    3912:	1a00           	moveb %d0,%d5
    3914:	2a47           	moveal %d7,%a5
    3916:	6000 f892      	braw 0x31aa
    391a:	0c87 0000 feff 	cmpil #65279,%d7
    3920:	6fe8           	bles 0x390a
    3922:	44af 0032      	negl %sp@(50)
    3926:	4245           	clrw %d5
    3928:	4200           	clrb %d0
    392a:	2a7c 0000 ff00 	moveal #65280,%a5
    3930:	6000 f878      	braw 0x31aa
    3934:	204a           	moveal %a2,%a0
    3936:	6000 f6f8      	braw 0x3030
    393a:	122e 0029      	moveb %fp@(41),%d1
    393e:	0201 0020      	andib #32,%d1
    3942:	1f41 0036      	moveb %d1,%sp@(54)
    3946:	6608           	bnes 0x3950
    3948:	4a2e 0026      	tstb %fp@(38)
    394c:	6600 0584      	bnew 0x3ed2
    3950:	102e 001b      	moveb %fp@(27),%d0
    3954:	6600 0448      	bnew 0x3d9e
    3958:	0c2e ffff 001e 	cmpib #-1,%fp@(30)
    395e:	6700 022a      	beqw 0x3b8a
    3962:	1e2e 0014      	moveb %fp@(20),%d7
    3966:	0207 0020      	andib #32,%d7
    396a:	162e 0014      	moveb %fp@(20),%d3
    396e:	0203 0008      	andib #8,%d3
    3972:	342f 0044      	movew %sp@(68),%d2
    3976:	7c02           	moveq #2,%d6
    3978:	4846           	swap %d6
    397a:	2a3c 0100 0000 	movel #16777216,%d5
    3980:	4a07           	tstb %d7
    3982:	6702           	beqs 0x3986
    3984:	e98e           	lsll #4,%d6
    3986:	4a42           	tstw %d2
    3988:	6700 0726      	beqw 0x40b0
    398c:	5342           	subqw #1,%d2
    398e:	2206           	movel %d6,%d1
    3990:	d285           	addl %d5,%d1
    3992:	0c81 00ff ffff 	cmpil #16777215,%d1
    3998:	6e00 0732      	bgtw 0x40cc
    399c:	226f 004e      	moveal %sp@(78),%a1
    39a0:	4a03           	tstb %d3
    39a2:	6600 0182      	bnew 0x3b26
    39a6:	2049           	moveal %a1,%a0
    39a8:	2801           	movel %d1,%d4
    39aa:	4844           	swap %d4
    39ac:	48c4           	extl %d4
    39ae:	3a04           	movew %d4,%d5
    39b0:	1019           	moveb %a1@+,%d0
    39b2:	4880           	extw %d0
    39b4:	48c0           	extl %d0
    39b6:	c1c4           	mulsw %d4,%d0
    39b8:	e080           	asrl #8,%d0
    39ba:	1340 ffff      	moveb %d0,%a1@(-1)
    39be:	4a42           	tstw %d2
    39c0:	6700 0188      	beqw 0x3b4a
    39c4:	5342           	subqw #1,%d2
    39c6:	d286           	addl %d6,%d1
    39c8:	0c81 00ff ffff 	cmpil #16777215,%d1
    39ce:	6fd6           	bles 0x39a6
    39d0:	1011           	moveb %a1@,%d0
    39d2:	4880           	extw %d0
    39d4:	48c0           	extl %d0
    39d6:	2449           	moveal %a1,%a2
    39d8:	43e8 0002      	lea %a0@(2),%a1
    39dc:	c1fc 00ff      	mulsw #255,%d0
    39e0:	e080           	asrl #8,%d0
    39e2:	1480           	moveb %d0,%a2@
    39e4:	3a3c 00ff      	movew #255,%d5
    39e8:	7200           	moveq #0,%d1
    39ea:	4641           	notw %d1
    39ec:	7000           	moveq #0,%d0
    39ee:	102e 001c      	moveb %fp@(28),%d0
    39f2:	e988           	lsll #4,%d0
    39f4:	3c02           	movew %d2,%d6
    39f6:	9c40           	subw %d0,%d6
    39f8:	4a42           	tstw %d2
    39fa:	6730           	beqs 0x3a2c
    39fc:	3802           	movew %d2,%d4
    39fe:	5344           	subqw #1,%d4
    3a00:	2049           	moveal %a1,%a0
    3a02:	1018           	moveb %a0@+,%d0
    3a04:	4880           	extw %d0
    3a06:	48c0           	extl %d0
    3a08:	c1c5           	mulsw %d5,%d0
    3a0a:	4a03           	tstb %d3
    3a0c:	6700 03c8      	beqw 0x3dd6
    3a10:	ec80           	asrl #6,%d0
    3a12:	0c40 0080      	cmpiw #128,%d0
    3a16:	6d00 0412      	bltw 0x3e2a
    3a1a:	707f           	moveq #127,%d0
    3a1c:	1140 ffff      	moveb %d0,%a0@(-1)
    3a20:	b446           	cmpw %d6,%d2
    3a22:	6700 03bc      	beqw 0x3de0
    3a26:	3404           	movew %d4,%d2
    3a28:	2248           	moveal %a0,%a1
    3a2a:	66d0           	bnes 0x39fc
    3a2c:	1a2e 001d      	moveb %fp@(29),%d5
    3a30:	6700 0158      	beqw 0x3b8a
    3a34:	4246           	clrw %d6
    3a36:	1c05           	moveb %d5,%d6
    3a38:	0285 0000 00ff 	andil #255,%d5
    3a3e:	2005           	movel %d5,%d0
    3a40:	c0c6           	muluw %d6,%d0
    3a42:	e488           	lsrl #2,%d0
    3a44:	dc40           	addw %d0,%d6
    3a46:	4a07           	tstb %d7
    3a48:	6600 042c      	bnew 0x3e76
    3a4c:	2805           	movel %d5,%d4
    3a4e:	7e0c           	moveq #12,%d7
    3a50:	efac           	lsll %d7,%d4
    3a52:	2005           	movel %d5,%d0
    3a54:	e888           	lsrl #4,%d0
    3a56:	3440           	moveaw %d0,%a2
    3a58:	41fa 0966      	lea %pc@(0x43c0),%a0
    3a5c:	2a00           	movel %d0,%d5
    3a5e:	da80           	addl %d0,%d5
    3a60:	3a30 5800      	movew %a0@(0,%d5:l),%d5
    3a64:	0285 0000 ffff 	andil #65535,%d5
    3a6a:	2645           	moveal %d5,%a3
    3a6c:	5280           	addql #1,%d0
    3a6e:	d080           	addl %d0,%d0
    3a70:	3030 0800      	movew %a0@(0,%d0:l),%d0
    3a74:	0280 0000 ffff 	andil #65535,%d0
    3a7a:	2f40 003a      	movel %d0,%sp@(58)
    3a7e:	4a42           	tstw %d2
    3a80:	6700 0108      	beqw 0x3b8a
    3a84:	0286 0000 ffff 	andil #65535,%d6
    3a8a:	2a46           	moveal %d6,%a5
    3a8c:	4247           	clrw %d7
    3a8e:	41fa 0930      	lea %pc@(0x43c0),%a0
    3a92:	2f48 003e      	movel %a0,%sp@(62)
    3a96:	304a           	moveaw %a2,%a0
    3a98:	5342           	subqw #1,%d2
    3a9a:	d88d           	addl %a5,%d4
    3a9c:	2a04           	movel %d4,%d5
    3a9e:	4245           	clrw %d5
    3aa0:	4845           	swap %d5
    3aa2:	0c85 0000 008e 	cmpil #142,%d5
    3aa8:	621a           	bhis 0x3ac4
    3aaa:	ba48           	cmpw %a0,%d5
    3aac:	6200 04e8      	bhiw 0x3f96
    3ab0:	302f 003c      	movew %sp@(60),%d0
    3ab4:	904b           	subw %a3,%d0
    3ab6:	3e00           	movew %d0,%d7
    3ab8:	48c7           	extl %d7
    3aba:	3004           	movew %d4,%d0
    3abc:	e048           	lsrw #8,%d0
    3abe:	cfc0           	mulsw %d0,%d7
    3ac0:	e087           	asrl #8,%d7
    3ac2:	de4b           	addw %a3,%d7
    3ac4:	7000           	moveq #0,%d0
    3ac6:	3007           	movew %d7,%d0
    3ac8:	9280           	subl %d0,%d1
    3aca:	1a2e 001e      	moveb %fp@(30),%d5
    3ace:	7000           	moveq #0,%d0
    3ad0:	1005           	moveb %d5,%d0
    3ad2:	e188           	lsll #8,%d0
    3ad4:	2449           	moveal %a1,%a2
    3ad6:	1c1a           	moveb %a2@+,%d6
    3ad8:	4886           	extw %d6
    3ada:	48c6           	extl %d6
    3adc:	b081           	cmpl %d1,%d0
    3ade:	6e00 0534      	bgtw 0x4014
    3ae2:	2a01           	movel %d1,%d5
    3ae4:	e085           	asrl #8,%d5
    3ae6:	cdc5           	mulsw %d5,%d6
    3ae8:	4a03           	tstb %d3
    3aea:	6700 04a4      	beqw 0x3f90
    3aee:	ec86           	asrl #6,%d6
    3af0:	0c46 0080      	cmpiw #128,%d6
    3af4:	6d00 048c      	bltw 0x3f82
    3af8:	7c7f           	moveq #127,%d6
    3afa:	1546 ffff      	moveb %d6,%a2@(-1)
    3afe:	4a42           	tstw %d2
    3b00:	6700 0088      	beqw 0x3b8a
    3b04:	224a           	moveal %a2,%a1
    3b06:	6090           	bras 0x3a98
    3b08:	0c40 ff7f      	cmpiw #-129,%d0
    3b0c:	6e02           	bgts 0x3b10
    3b0e:	7080           	moveq #-128,%d0
    3b10:	1340 ffff      	moveb %d0,%a1@(-1)
    3b14:	4a42           	tstw %d2
    3b16:	6732           	beqs 0x3b4a
    3b18:	5342           	subqw #1,%d2
    3b1a:	d286           	addl %d6,%d1
    3b1c:	0c81 00ff ffff 	cmpil #16777215,%d1
    3b22:	6e00 0384      	bgtw 0x3ea8
    3b26:	2049           	moveal %a1,%a0
    3b28:	2801           	movel %d1,%d4
    3b2a:	4844           	swap %d4
    3b2c:	48c4           	extl %d4
    3b2e:	3a04           	movew %d4,%d5
    3b30:	1019           	moveb %a1@+,%d0
    3b32:	4880           	extw %d0
    3b34:	48c0           	extl %d0
    3b36:	c1c4           	mulsw %d4,%d0
    3b38:	ec80           	asrl #6,%d0
    3b3a:	0c40 0080      	cmpiw #128,%d0
    3b3e:	6dc8           	blts 0x3b08
    3b40:	707f           	moveq #127,%d0
    3b42:	1340 ffff      	moveb %d0,%a1@(-1)
    3b46:	4a42           	tstw %d2
    3b48:	66ce           	bnes 0x3b18
    3b4a:	e081           	asrl #8,%d1
    3b4c:	4242           	clrw %d2
    3b4e:	7000           	moveq #0,%d0
    3b50:	102e 001c      	moveb %fp@(28),%d0
    3b54:	e988           	lsll #4,%d0
    3b56:	3c02           	movew %d2,%d6
    3b58:	9c40           	subw %d0,%d6
    3b5a:	6000 fe9c      	braw 0x39f8
    3b5e:	e081           	asrl #8,%d1
    3b60:	1081           	moveb %d1,%a0@
    3b62:	4a42           	tstw %d2
    3b64:	6724           	beqs 0x3b8a
    3b66:	e080           	asrl #8,%d0
    3b68:	0282 0000 ffff 	andil #65535,%d2
    3b6e:	41f2 2800      	lea %a2@(0,%d2:l),%a0
    3b72:	4a03           	tstb %d3
    3b74:	6600 03d2      	bnew 0x3f48
    3b78:	121a           	moveb %a2@+,%d1
    3b7a:	4881           	extw %d1
    3b7c:	48c1           	extl %d1
    3b7e:	c3c0           	mulsw %d0,%d1
    3b80:	e081           	asrl #8,%d1
    3b82:	1541 ffff      	moveb %d1,%a2@(-1)
    3b86:	b5c8           	cmpal %a0,%a2
    3b88:	66ee           	bnes 0x3b78
    3b8a:	4a2f 0036      	tstb %sp@(54)
    3b8e:	6708           	beqs 0x3b98
    3b90:	4a2e 0026      	tstb %fp@(38)
    3b94:	6600 0358      	bnew 0x3eee
    3b98:	142e 0014      	moveb %fp@(20),%d2
    3b9c:	0802 0006      	btst #6,%d2
    3ba0:	6600 0134      	bnew 0x3cd6
    3ba4:	102e 001a      	moveb %fp@(26),%d0
    3ba8:	6700 00b0      	beqw 0x3c5a
    3bac:	5300           	subqb #1,%d0
    3bae:	b02f 0076      	cmpb %sp@(118),%d0
    3bb2:	6700 00a6      	beqw 0x3c5a
    3bb6:	226f 009c      	moveal %sp@(156),%a1
    3bba:	2069 09fe      	moveal %a1@(2558),%a0
    3bbe:	4241           	clrw %d1
    3bc0:	1200           	moveb %d0,%d1
    3bc2:	c2fc 002a      	muluw #42,%d1
    3bc6:	2068 0120      	moveal %a0@(288),%a0
    3bca:	d1c1           	addal %d1,%a0
    3bcc:	0280 0000 00ff 	andil #255,%d0
    3bd2:	0680 0000 0281 	addil #641,%d0
    3bd8:	d080           	addl %d0,%d0
    3bda:	d080           	addl %d0,%d0
    3bdc:	2e31 0800      	movel %a1@(0,%d0:l),%d7
    3be0:	7800           	moveq #0,%d4
    3be2:	1828 0019      	moveb %a0@(25),%d4
    3be6:	5284           	addql #1,%d4
    3be8:	ef8c           	lsll #7,%d4
    3bea:	7a00           	moveq #0,%d5
    3bec:	1a2e 0019      	moveb %fp@(25),%d5
    3bf0:	5285           	addql #1,%d5
    3bf2:	ef8d           	lsll #7,%d5
    3bf4:	2604           	movel %d4,%d3
    3bf6:	ba84           	cmpl %d4,%d5
    3bf8:	6500 031c      	bcsw 0x3f16
    3bfc:	0828 0002 0014 	btst #2,%a0@(20)
    3c02:	6700 031e      	beqw 0x3f22
    3c06:	0802 0002      	btst #2,%d2
    3c0a:	6606           	bnes 0x3c12
    3c0c:	7201           	moveq #1,%d1
    3c0e:	2f41 002e      	movel %d1,%sp@(46)
    3c12:	2c2f 004e      	movel %sp@(78),%d6
    3c16:	95ca           	subal %a2,%a2
    3c18:	266f 002e      	moveal %sp@(46),%a3
    3c1c:	4a83           	tstl %d3
    3c1e:	6726           	beqs 0x3c46
    3c20:	2046           	moveal %d6,%a0
    3c22:	2247           	moveal %d7,%a1
    3c24:	4241           	clrw %d1
    3c26:	1010           	moveb %a0@,%d0
    3c28:	4880           	extw %d0
    3c2a:	1419           	moveb %a1@+,%d2
    3c2c:	4882           	extw %d2
    3c2e:	d042           	addw %d2,%d0
    3c30:	0c40 0080      	cmpiw #128,%d0
    3c34:	6d00 0330      	bltw 0x3f66
    3c38:	707f           	moveq #127,%d0
    3c3a:	10c0           	moveb %d0,%a0@+
    3c3c:	5241           	addqw #1,%d1
    3c3e:	7000           	moveq #0,%d0
    3c40:	3001           	movew %d1,%d0
    3c42:	b680           	cmpl %d0,%d3
    3c44:	62e0           	bhis 0x3c26
    3c46:	e28b           	lsrl #1,%d3
    3c48:	de84           	addl %d4,%d7
    3c4a:	dc85           	addl %d5,%d6
    3c4c:	e28c           	lsrl #1,%d4
    3c4e:	e28d           	lsrl #1,%d5
    3c50:	528a           	addql #1,%a2
    3c52:	b7ca           	cmpal %a2,%a3
    3c54:	66c6           	bnes 0x3c1c
    3c56:	142e 0014      	moveb %fp@(20),%d2
    3c5a:	0802 0002      	btst #2,%d2
    3c5e:	674c           	beqs 0x3cac
    3c60:	7200           	moveq #0,%d1
    3c62:	122e 0019      	moveb %fp@(25),%d1
    3c66:	5281           	addql #1,%d1
    3c68:	c2fc 0080      	muluw #128,%d1
    3c6c:	206f 004e      	moveal %sp@(78),%a0
    3c70:	d1c1           	addal %d1,%a0
    3c72:	e289           	lsrl #1,%d1
    3c74:	7403           	moveq #3,%d2
    3c76:	266f 004e      	moveal %sp@(78),%a3
    3c7a:	7000           	moveq #0,%d0
    3c7c:	4a41           	tstw %d1
    3c7e:	6722           	beqs 0x3ca2
    3c80:	3001           	movew %d1,%d0
    3c82:	5340           	subqw #1,%d0
    3c84:	0280 0000 ffff 	andil #65535,%d0
    3c8a:	45f0 0801      	lea %a0@(1,%d0:l),%a2
    3c8e:	224b           	moveal %a3,%a1
    3c90:	10d1           	moveb %a1@,%a0@+
    3c92:	5489           	addql #2,%a1
    3c94:	b5c8           	cmpal %a0,%a2
    3c96:	66f8           	bnes 0x3c90
    3c98:	7000           	moveq #0,%d0
    3c9a:	3001           	movew %d1,%d0
    3c9c:	2040           	moveal %d0,%a0
    3c9e:	d1c0           	addal %d0,%a0
    3ca0:	d7c8           	addal %a0,%a3
    3ca2:	41f3 0800      	lea %a3@(0,%d0:l),%a0
    3ca6:	e249           	lsrw #1,%d1
    3ca8:	5342           	subqw #1,%d2
    3caa:	66ce           	bnes 0x3c7a
    3cac:	206f 00a4      	moveal %sp@(164),%a0
    3cb0:	7400           	moveq #0,%d2
    3cb2:	1410           	moveb %a0@,%d2
    3cb4:	2002           	movel %d2,%d0
    3cb6:	5380           	subql #1,%d0
    3cb8:	b0af 0066      	cmpl %sp@(102),%d0
    3cbc:	6700 0306      	beqw 0x3fc4
    3cc0:	52af 0066      	addql #1,%sp@(102)
    3cc4:	b4af 0066      	cmpl %sp@(102),%d2
    3cc8:	6e00 f0b4      	bgtw 0x2d7e
    3ccc:	4cdf 6cfc      	moveml %sp@+,%d2-%d7/%a2-%a3/%a5-%fp
    3cd0:	4fef 0070      	lea %sp@(112),%sp
    3cd4:	4e75           	rts
    3cd6:	7000           	moveq #0,%d0
    3cd8:	1016           	moveb %fp@,%d0
    3cda:	e188           	lsll #8,%d0
    3cdc:	802e 0001      	orb %fp@(1),%d0
    3ce0:	7800           	moveq #0,%d4
    3ce2:	182e 0002      	moveb %fp@(2),%d4
    3ce6:	e18c           	lsll #8,%d4
    3ce8:	882e 0003      	orb %fp@(3),%d4
    3cec:	9880           	subl %d0,%d4
    3cee:	7200           	moveq #0,%d1
    3cf0:	122e 000a      	moveb %fp@(10),%d1
    3cf4:	e189           	lsll #8,%d1
    3cf6:	822e 000b      	orb %fp@(11),%d1
    3cfa:	e289           	lsrl #1,%d1
    3cfc:	b284           	cmpl %d4,%d1
    3cfe:	6d00 fea4      	bltw 0x3ba4
    3d02:	4a84           	tstl %d4
    3d04:	6700 fe9e      	beqw 0x3ba4
    3d08:	262f 004e      	movel %sp@(78),%d3
    3d0c:	d680           	addl %d0,%d3
    3d0e:	9084           	subl %d4,%d0
    3d10:	246f 004e      	moveal %sp@(78),%a2
    3d14:	d5c0           	addal %d0,%a2
    3d16:	2f04           	movel %d4,%sp@-
    3d18:	2f3c 0000 ffff 	movel #65535,%sp@-
    3d1e:	206f 004e      	moveal %sp@(78),%a0
    3d22:	4e90           	jsr %a0@
    3d24:	508f           	addql #8,%sp
    3d26:	3240           	moveaw %d0,%a1
    3d28:	4a84           	tstl %d4
    3d2a:	6f00 fe78      	blew 0x3ba4
    3d2e:	2043           	moveal %d3,%a0
    3d30:	4241           	clrw %d1
    3d32:	1410           	moveb %a0@,%d2
    3d34:	4882           	extw %d2
    3d36:	3801           	movew %d1,%d4
    3d38:	e04c           	lsrw #8,%d4
    3d3a:	101a           	moveb %a2@+,%d0
    3d3c:	4880           	extw %d0
    3d3e:	9042           	subw %d2,%d0
    3d40:	48c0           	extl %d0
    3d42:	c1c4           	mulsw %d4,%d0
    3d44:	e080           	asrl #8,%d0
    3d46:	d400           	addb %d0,%d2
    3d48:	10c2           	moveb %d2,%a0@+
    3d4a:	d249           	addw %a1,%d1
    3d4c:	b5c3           	cmpal %d3,%a2
    3d4e:	66e2           	bnes 0x3d32
    3d50:	142e 0014      	moveb %fp@(20),%d2
    3d54:	6000 fe4e      	braw 0x3ba4
    3d58:	7002           	moveq #2,%d0
    3d5a:	e3a8           	lsll %d1,%d0
    3d5c:	cbc0           	mulsw %d0,%d5
    3d5e:	1f7c 0001 0036 	moveb #1,%sp@(54)
    3d64:	6000 f1f2      	braw 0x2f58
    3d68:	bafc 0000      	cmpaw #0,%a5
    3d6c:	6d00 fb9c      	bltw 0x390a
    3d70:	4a87           	tstl %d7
    3d72:	6e00 fb96      	bgtw 0x390a
    3d76:	44af 0032      	negl %sp@(50)
    3d7a:	3a3c 00ff      	movew #255,%d5
    3d7e:	50c0           	st %d0
    3d80:	9bcd           	subal %a5,%a5
    3d82:	6000 f426      	braw 0x31aa
    3d86:	76ff           	moveq #-1,%d3
    3d88:	6000 f162      	braw 0x2eec
    3d8c:	7601           	moveq #1,%d3
    3d8e:	6000 f15c      	braw 0x2eec
    3d92:	7602           	moveq #2,%d3
    3d94:	6000 f156      	braw 0x2eec
    3d98:	76fe           	moveq #-2,%d3
    3d9a:	6000 f150      	braw 0x2eec
    3d9e:	1e2e 0014      	moveb %fp@(20),%d7
    3da2:	0207 0020      	andib #32,%d7
    3da6:	162e 0014      	moveb %fp@(20),%d3
    3daa:	0203 0008      	andib #8,%d3
    3dae:	342f 0044      	movew %sp@(68),%d2
    3db2:	0280 0000 00ff 	andil #255,%d0
    3db8:	2f00           	movel %d0,%sp@-
    3dba:	2f3c 0002 0000 	movel #131072,%sp@-
    3dc0:	246f 004e      	moveal %sp@(78),%a2
    3dc4:	4e92           	jsr %a2@
    3dc6:	508f           	addql #8,%sp
    3dc8:	2c00           	movel %d0,%d6
    3dca:	7a00           	moveq #0,%d5
    3dcc:	6000 fbb2      	braw 0x3980
    3dd0:	7603           	moveq #3,%d3
    3dd2:	6000 f118      	braw 0x2eec
    3dd6:	e080           	asrl #8,%d0
    3dd8:	1280           	moveb %d0,%a1@
    3dda:	b446           	cmpw %d6,%d2
    3ddc:	6600 fc48      	bnew 0x3a26
    3de0:	1a2e 001d      	moveb %fp@(29),%d5
    3de4:	6600 00a4      	bnew 0x3e8a
    3de8:	4a44           	tstw %d4
    3dea:	6700 fd9e      	beqw 0x3b8a
    3dee:	5542           	subqw #2,%d2
    3df0:	122e 001e      	moveb %fp@(30),%d1
    3df4:	7000           	moveq #0,%d0
    3df6:	1001           	moveb %d1,%d0
    3df8:	e188           	lsll #8,%d0
    3dfa:	45e9 0002      	lea %a1@(2),%a2
    3dfe:	4244           	clrw %d4
    3e00:	1801           	moveb %d1,%d4
    3e02:	1210           	moveb %a0@,%d1
    3e04:	4881           	extw %d1
    3e06:	48c1           	extl %d1
    3e08:	c3c4           	mulsw %d4,%d1
    3e0a:	4a03           	tstb %d3
    3e0c:	6700 fd50      	beqw 0x3b5e
    3e10:	ec81           	asrl #6,%d1
    3e12:	0c41 0080      	cmpiw #128,%d1
    3e16:	6c00 0260      	bgew 0x4078
    3e1a:	0c41 ff7f      	cmpiw #-129,%d1
    3e1e:	6e00 fd40      	bgtw 0x3b60
    3e22:	7280           	moveq #-128,%d1
    3e24:	1081           	moveb %d1,%a0@
    3e26:	6000 fd3a      	braw 0x3b62
    3e2a:	0c40 ff7f      	cmpiw #-129,%d0
    3e2e:	6e00 fbec      	bgtw 0x3a1c
    3e32:	7080           	moveq #-128,%d0
    3e34:	1140 ffff      	moveb %d0,%a0@(-1)
    3e38:	b446           	cmpw %d6,%d2
    3e3a:	6600 fbea      	bnew 0x3a26
    3e3e:	60a0           	bras 0x3de0
    3e40:	76fd           	moveq #-3,%d3
    3e42:	6000 f0a8      	braw 0x2eec
    3e46:	76fc           	moveq #-4,%d3
    3e48:	6000 f0a2      	braw 0x2eec
    3e4c:	7604           	moveq #4,%d3
    3e4e:	6000 f09c      	braw 0x2eec
    3e52:	7605           	moveq #5,%d3
    3e54:	6000 f096      	braw 0x2eec
    3e58:	76fb           	moveq #-5,%d3
    3e5a:	6000 f090      	braw 0x2eec
    3e5e:	76fa           	moveq #-6,%d3
    3e60:	6000 f08a      	braw 0x2eec
    3e64:	7606           	moveq #6,%d3
    3e66:	6000 f084      	braw 0x2eec
    3e6a:	7607           	moveq #7,%d3
    3e6c:	6000 f07e      	braw 0x2eec
    3e70:	76f9           	moveq #-7,%d3
    3e72:	6000 f078      	braw 0x2eec
    3e76:	2f7c 0000 0200 	movel #512,%sp@(58)
    3e7c:	003a 
    3e7e:	367c 0400      	moveaw #1024,%a3
    3e82:	95ca           	subal %a2,%a2
    3e84:	7800           	moveq #0,%d4
    3e86:	6000 fbf6      	braw 0x3a7e
    3e8a:	2248           	moveal %a0,%a1
    3e8c:	3404           	movew %d4,%d2
    3e8e:	4246           	clrw %d6
    3e90:	1c05           	moveb %d5,%d6
    3e92:	0285 0000 00ff 	andil #255,%d5
    3e98:	2005           	movel %d5,%d0
    3e9a:	c0c6           	muluw %d6,%d0
    3e9c:	e488           	lsrl #2,%d0
    3e9e:	dc40           	addw %d0,%d6
    3ea0:	4a07           	tstb %d7
    3ea2:	66d2           	bnes 0x3e76
    3ea4:	6000 fba6      	braw 0x3a4c
    3ea8:	1011           	moveb %a1@,%d0
    3eaa:	4880           	extw %d0
    3eac:	48c0           	extl %d0
    3eae:	2449           	moveal %a1,%a2
    3eb0:	43e8 0002      	lea %a0@(2),%a1
    3eb4:	c1fc 00ff      	mulsw #255,%d0
    3eb8:	ec80           	asrl #6,%d0
    3eba:	0c40 0080      	cmpiw #128,%d0
    3ebe:	6d00 0174      	bltw 0x4034
    3ec2:	707f           	moveq #127,%d0
    3ec4:	1480           	moveb %d0,%a2@
    3ec6:	3a3c 00ff      	movew #255,%d5
    3eca:	7200           	moveq #0,%d1
    3ecc:	4641           	notw %d1
    3ece:	6000 fb1c      	braw 0x39ec
    3ed2:	3f2f 0044      	movew %sp@(68),%sp@-
    3ed6:	4267           	clrw %sp@-
    3ed8:	2f2f 0052      	movel %sp@(82),%sp@-
    3edc:	486e 0026      	pea %fp@(38)
    3ee0:	41fa e2cc      	lea %pc@(0x21ae),%a0
    3ee4:	4e90           	jsr %a0@
    3ee6:	4fef 000c      	lea %sp@(12),%sp
    3eea:	6000 fa64      	braw 0x3950
    3eee:	3f2f 0044      	movew %sp@(68),%sp@-
    3ef2:	4267           	clrw %sp@-
    3ef4:	2f2f 0052      	movel %sp@(82),%sp@-
    3ef8:	486e 0026      	pea %fp@(38)
    3efc:	41fa e2b0      	lea %pc@(0x21ae),%a0
    3f00:	4e90           	jsr %a0@
    3f02:	4fef 000c      	lea %sp@(12),%sp
    3f06:	142e 0014      	moveb %fp@(20),%d2
    3f0a:	0802 0006      	btst #6,%d2
    3f0e:	6700 fc94      	beqw 0x3ba4
    3f12:	6000 fdc2      	braw 0x3cd6
    3f16:	2605           	movel %d5,%d3
    3f18:	0828 0002 0014 	btst #2,%a0@(20)
    3f1e:	6600 fce6      	bnew 0x3c06
    3f22:	7401           	moveq #1,%d2
    3f24:	2f42 002e      	movel %d2,%sp@(46)
    3f28:	2c2f 004e      	movel %sp@(78),%d6
    3f2c:	95ca           	subal %a2,%a2
    3f2e:	266f 002e      	moveal %sp@(46),%a3
    3f32:	6000 fce8      	braw 0x3c1c
    3f36:	0c41 ff7f      	cmpiw #-129,%d1
    3f3a:	6e02           	bgts 0x3f3e
    3f3c:	7280           	moveq #-128,%d1
    3f3e:	1541 ffff      	moveb %d1,%a2@(-1)
    3f42:	b1ca           	cmpal %a2,%a0
    3f44:	6700 fc44      	beqw 0x3b8a
    3f48:	121a           	moveb %a2@+,%d1
    3f4a:	4881           	extw %d1
    3f4c:	48c1           	extl %d1
    3f4e:	c3c0           	mulsw %d0,%d1
    3f50:	ec81           	asrl #6,%d1
    3f52:	0c41 0080      	cmpiw #128,%d1
    3f56:	6dde           	blts 0x3f36
    3f58:	727f           	moveq #127,%d1
    3f5a:	1541 ffff      	moveb %d1,%a2@(-1)
    3f5e:	b1ca           	cmpal %a2,%a0
    3f60:	66e6           	bnes 0x3f48
    3f62:	6000 fc26      	braw 0x3b8a
    3f66:	0c40 ff7f      	cmpiw #-129,%d0
    3f6a:	6e00 fcce      	bgtw 0x3c3a
    3f6e:	7080           	moveq #-128,%d0
    3f70:	10c0           	moveb %d0,%a0@+
    3f72:	5241           	addqw #1,%d1
    3f74:	7000           	moveq #0,%d0
    3f76:	3001           	movew %d1,%d0
    3f78:	b680           	cmpl %d0,%d3
    3f7a:	6200 fcaa      	bhiw 0x3c26
    3f7e:	6000 fcc6      	braw 0x3c46
    3f82:	0c46 ff7f      	cmpiw #-129,%d6
    3f86:	6e00 fb72      	bgtw 0x3afa
    3f8a:	7c80           	moveq #-128,%d6
    3f8c:	6000 fb6c      	braw 0x3afa
    3f90:	e086           	asrl #8,%d6
    3f92:	6000 fb66      	braw 0x3afa
    3f96:	2005           	movel %d5,%d0
    3f98:	d085           	addl %d5,%d0
    3f9a:	246f 003e      	moveal %sp@(62),%a2
    3f9e:	3032 0800      	movew %a2@(0,%d0:l),%d0
    3fa2:	266f 003a      	moveal %sp@(58),%a3
    3fa6:	7c00           	moveq #0,%d6
    3fa8:	3c00           	movew %d0,%d6
    3faa:	2f46 003a      	movel %d6,%sp@(58)
    3fae:	3045           	moveaw %d5,%a0
    3fb0:	904b           	subw %a3,%d0
    3fb2:	3e00           	movew %d0,%d7
    3fb4:	48c7           	extl %d7
    3fb6:	3004           	movew %d4,%d0
    3fb8:	e048           	lsrw #8,%d0
    3fba:	cfc0           	mulsw %d0,%d7
    3fbc:	e087           	asrl #8,%d7
    3fbe:	de4b           	addw %a3,%d7
    3fc0:	6000 fb02      	braw 0x3ac4
    3fc4:	42a7           	clrl %sp@-
    3fc6:	2f2f 00a0      	movel %sp@(160),%sp@-
    3fca:	41fa df6a      	lea %pc@(0x1f36),%a0
    3fce:	4e90           	jsr %a0@
    3fd0:	2f42 006e      	movel %d2,%sp@(110)
    3fd4:	226f 00ac      	moveal %sp@(172),%a1
    3fd8:	7000           	moveq #0,%d0
    3fda:	1011           	moveb %a1@,%d0
    3fdc:	508f           	addql #8,%sp
    3fde:	b480           	cmpl %d0,%d2
    3fe0:	6d00 ed9c      	bltw 0x2d7e
    3fe4:	4cdf 6cfc      	moveml %sp@+,%d2-%d7/%a2-%a3/%a5-%fp
    3fe8:	4fef 0070      	lea %sp@(112),%sp
    3fec:	4e75           	rts
    3fee:	76f8           	moveq #-8,%d3
    3ff0:	6000 eefa      	braw 0x2eec
    3ff4:	2a42           	moveal %d2,%a5
    3ff6:	3a2f 004c      	movew %sp@(76),%d5
    3ffa:	102f 004b      	moveb %sp@(75),%d0
    3ffe:	6000 f1aa      	braw 0x31aa
    4002:	7608           	moveq #8,%d3
    4004:	6000 eee6      	braw 0x2eec
    4008:	7609           	moveq #9,%d3
    400a:	6000 eee0      	braw 0x2eec
    400e:	76f7           	moveq #-9,%d3
    4010:	6000 eeda      	braw 0x2eec
    4014:	0245 00ff      	andiw #255,%d5
    4018:	2206           	movel %d6,%d1
    401a:	c3c5           	mulsw %d5,%d1
    401c:	4a03           	tstb %d3
    401e:	6740           	beqs 0x4060
    4020:	ec81           	asrl #6,%d1
    4022:	0c41 0080      	cmpiw #128,%d1
    4026:	6c48           	bges 0x4070
    4028:	0c41 ff7f      	cmpiw #-129,%d1
    402c:	6f3a           	bles 0x4068
    402e:	1281           	moveb %d1,%a1@
    4030:	6000 fb30      	braw 0x3b62
    4034:	0c40 ff7f      	cmpiw #-129,%d0
    4038:	6e00 f9a8      	bgtw 0x39e2
    403c:	7080           	moveq #-128,%d0
    403e:	1480           	moveb %d0,%a2@
    4040:	3a3c 00ff      	movew #255,%d5
    4044:	7200           	moveq #0,%d1
    4046:	4641           	notw %d1
    4048:	6000 f9a2      	braw 0x39ec
    404c:	76f6           	moveq #-10,%d3
    404e:	6000 ee9c      	braw 0x2eec
    4052:	2a47           	moveal %d7,%a5
    4054:	3a2f 0052      	movew %sp@(82),%d5
    4058:	102f 0054      	moveb %sp@(84),%d0
    405c:	6000 f14c      	braw 0x31aa
    4060:	e081           	asrl #8,%d1
    4062:	1281           	moveb %d1,%a1@
    4064:	6000 fafc      	braw 0x3b62
    4068:	7280           	moveq #-128,%d1
    406a:	1281           	moveb %d1,%a1@
    406c:	6000 faf4      	braw 0x3b62
    4070:	727f           	moveq #127,%d1
    4072:	1281           	moveb %d1,%a1@
    4074:	6000 faec      	braw 0x3b62
    4078:	727f           	moveq #127,%d1
    407a:	1081           	moveb %d1,%a0@
    407c:	6000 fae4      	braw 0x3b62
    4080:	263c 0000 0aaa 	movel #2730,%d3
    4086:	4878 000c      	pea 0xc
    408a:	2f02           	movel %d2,%sp@-
    408c:	41fa 0126      	lea %pc@(0x41b4),%a0
    4090:	4e90           	jsr %a0@
    4092:	508f           	addql #8,%sp
    4094:	0280 0000 ffff 	andil #65535,%d0
    409a:	2f03           	movel %d3,%sp@-
    409c:	720c           	moveq #12,%d1
    409e:	9280           	subl %d0,%d1
    40a0:	2f01           	movel %d1,%sp@-
    40a2:	206f 003a      	moveal %sp@(58),%a0
    40a6:	4e90           	jsr %a0@
    40a8:	508f           	addql #8,%sp
    40aa:	dc80           	addl %d0,%d6
    40ac:	6000 f722      	braw 0x37d0
    40b0:	2205           	movel %d5,%d1
    40b2:	e081           	asrl #8,%d1
    40b4:	4245           	clrw %d5
    40b6:	4845           	swap %d5
    40b8:	226f 004e      	moveal %sp@(78),%a1
    40bc:	7000           	moveq #0,%d0
    40be:	102e 001c      	moveb %fp@(28),%d0
    40c2:	e988           	lsll #4,%d0
    40c4:	3c02           	movew %d2,%d6
    40c6:	9c40           	subw %d0,%d6
    40c8:	6000 f92e      	braw 0x39f8
    40cc:	226f 004e      	moveal %sp@(78),%a1
    40d0:	1019           	moveb %a1@+,%d0
    40d2:	4880           	extw %d0
    40d4:	48c0           	extl %d0
    40d6:	246f 004e      	moveal %sp@(78),%a2
    40da:	4a03           	tstb %d3
    40dc:	6600 fdd6      	bnew 0x3eb4
    40e0:	c1fc 00ff      	mulsw #255,%d0
    40e4:	e080           	asrl #8,%d0
    40e6:	6000 f8fa      	braw 0x39e2
    40ea:	4240           	clrw %d0
    40ec:	1540 ffff      	moveb %d0,%a2@(-1)
    40f0:	b7ca           	cmpal %a2,%a3
    40f2:	6600 f124      	bnew 0x3218
    40f6:	6000 f17c      	braw 0x3274
    40fa:	2448           	moveal %a0,%a2
    40fc:	4243           	clrw %d3
    40fe:	6000 edec      	braw 0x2eec
    4102:	247c 0000 8000 	moveal #32768,%a2
    4108:	6000 ee18      	braw 0x2f22
    410c:	302f 0004      	movew %sp@(4),%d0
    4110:	c0ef 000a      	muluw %sp@(10),%d0
    4114:	322f 0006      	movew %sp@(6),%d1
    4118:	c2ef 0008      	muluw %sp@(8),%d1
    411c:	d041           	addw %d1,%d0
    411e:	4840           	swap %d0
    4120:	4240           	clrw %d0
    4122:	322f 0006      	movew %sp@(6),%d1
    4126:	c2ef 000a      	muluw %sp@(10),%d1
    412a:	d081           	addl %d1,%d0
    412c:	4e75           	rts
    412e:	2f02           	movel %d2,%sp@-
    4130:	222f 000c      	movel %sp@(12),%d1
    4134:	202f 0008      	movel %sp@(8),%d0
    4138:	0c81 0001 0000 	cmpil #65536,%d1
    413e:	6416           	bccs 0x4156
    4140:	2400           	movel %d0,%d2
    4142:	4242           	clrw %d2
    4144:	4842           	swap %d2
    4146:	84c1           	divuw %d1,%d2
    4148:	3002           	movew %d2,%d0
    414a:	4840           	swap %d0
    414c:	342f 000a      	movew %sp@(10),%d2
    4150:	84c1           	divuw %d1,%d2
    4152:	3002           	movew %d2,%d0
    4154:	6030           	bras 0x4186
    4156:	2401           	movel %d1,%d2
    4158:	e289           	lsrl #1,%d1
    415a:	e288           	lsrl #1,%d0
    415c:	0c81 0001 0000 	cmpil #65536,%d1
    4162:	64f4           	bccs 0x4158
    4164:	80c1           	divuw %d1,%d0
    4166:	0280 0000 ffff 	andil #65535,%d0
    416c:	2202           	movel %d2,%d1
    416e:	c2c0           	muluw %d0,%d1
    4170:	4842           	swap %d2
    4172:	c4c0           	muluw %d0,%d2
    4174:	4842           	swap %d2
    4176:	4a42           	tstw %d2
    4178:	660a           	bnes 0x4184
    417a:	d282           	addl %d2,%d1
    417c:	6506           	bcss 0x4184
    417e:	b2af 0008      	cmpl %sp@(8),%d1
    4182:	6302           	blss 0x4186
    4184:	5380           	subql #1,%d0
    4186:	241f           	movel %sp@+,%d2
    4188:	4e75           	rts
    418a:	2f02           	movel %d2,%sp@-
    418c:	7401           	moveq #1,%d2
    418e:	222f 000c      	movel %sp@(12),%d1
    4192:	6a04           	bpls 0x4198
    4194:	4481           	negl %d1
    4196:	4402           	negb %d2
    4198:	202f 0008      	movel %sp@(8),%d0
    419c:	6a04           	bpls 0x41a2
    419e:	4480           	negl %d0
    41a0:	4402           	negb %d2
    41a2:	2f01           	movel %d1,%sp@-
    41a4:	2f00           	movel %d0,%sp@-
    41a6:	6186           	bsrs 0x412e
    41a8:	508f           	addql #8,%sp
    41aa:	4a02           	tstb %d2
    41ac:	6a02           	bpls 0x41b0
    41ae:	4480           	negl %d0
    41b0:	241f           	movel %sp@+,%d2
    41b2:	4e75           	rts
    41b4:	222f 0008      	movel %sp@(8),%d1
    41b8:	202f 0004      	movel %sp@(4),%d0
    41bc:	2f01           	movel %d1,%sp@-
    41be:	2f00           	movel %d0,%sp@-
    41c0:	61c8           	bsrs 0x418a
    41c2:	508f           	addql #8,%sp
    41c4:	222f 0008      	movel %sp@(8),%d1
    41c8:	2f01           	movel %d1,%sp@-
    41ca:	2f00           	movel %d0,%sp@-
    41cc:	6100 ff3e      	bsrw 0x410c
    41d0:	508f           	addql #8,%sp
    41d2:	222f 0004      	movel %sp@(4),%d1
    41d6:	9280           	subl %d0,%d1
    41d8:	2001           	movel %d1,%d0
    41da:	4e75           	rts
    41dc:	222f 0008      	movel %sp@(8),%d1
    41e0:	202f 0004      	movel %sp@(4),%d0
    41e4:	2f01           	movel %d1,%sp@-
    41e6:	2f00           	movel %d0,%sp@-
    41e8:	6100 ff44      	bsrw 0x412e
    41ec:	508f           	addql #8,%sp
    41ee:	222f 0008      	movel %sp@(8),%d1
    41f2:	2f01           	movel %d1,%sp@-
    41f4:	2f00           	movel %d0,%sp@-
    41f6:	6100 ff14      	bsrw 0x410c
    41fa:	508f           	addql #8,%sp
    41fc:	222f 0004      	movel %sp@(4),%d1
    4200:	9280           	subl %d0,%d1
    4202:	2001           	movel %d1,%d0
    4204:	4e75           	rts
    4206:	2f0e           	movel %fp,%sp@-
    4208:	2c78 0004      	moveal 0x4,%fp
    420c:	4eae fdfc      	jsr %fp@(-516)
    4210:	2c5f           	moveal %sp@+,%fp
    4212:	4e75           	rts
    4214:	16c0           	moveb %d0,%a3@+
    4216:	4e75           	rts
    4218:	0000 0001      	orib #1,%d0
    421c:	0002 0003      	orib #3,%d2
    4220:	0004 0005      	orib #5,%d4
    4224:	0006 0007      	orib #7,%d6
    4228:	0008           	.short 0x0008
    422a:	0009           	.short 0x0009
    422c:	000a           	.short 0x000a
    422e:	000b           	.short 0x000b
    4230:	000c           	.short 0x000c
    4232:	000d           	.short 0x000d
    4234:	000e           	.short 0x000e
    4236:	000f           	.short 0x000f
    4238:	000f           	.short 0x000f
    423a:	000e           	.short 0x000e
    423c:	000d           	.short 0x000d
    423e:	000c           	.short 0x000c
    4240:	000b           	.short 0x000b
    4242:	000a           	.short 0x000a
    4244:	0009           	.short 0x0009
    4246:	0008           	.short 0x0008
    4248:	0007 0006      	orib #6,%d7
    424c:	0005 0004      	orib #4,%d5
    4250:	0003 0002      	orib #2,%d3
    4254:	0001 0000      	orib #0,%d1
    4258:	004d           	.short 0x004d
    425a:	0125           	btst %d0,%a5@-
    425c:	021b 0437      	andib #55,%a3@+
    4260:	0539 0755 096d 	btst %d2,0x755096d
    4266:	0bd7           	bset %d5,%sp@
    4268:	0203 0405      	andib #5,%d3
    426c:	0607 0809      	addib #9,%d7
    4270:	0a0b           	.short 0x0a0b
    4272:	0c0d           	.short 0x0c0d
    4274:	0e14           	.short 0x0e14
    4276:	2850           	moveal %a0@,%a4
    4278:	0008           	.short 0x0008
    427a:	090a 0b0c      	movepw %a2@(2828),%d4
    427e:	0d0e 1214      	movepw %fp@(4628),%d6
    4282:	1c28 3246      	moveb %a0@(12870),%d6
    4286:	a0ff           	.short 0xa0ff
    4288:	0004 080a      	orib #10,%d4
    428c:	0c0e           	.short 0x0c0e
    428e:	1012           	moveb %a2@,%d0
    4290:	1418           	moveb %a0@+,%d2
    4292:	2028 3860      	movel %a0@(14432),%d0
    4296:	96ff           	.short 0x96ff
    4298:	0001 0306      	orib #6,%d1
    429c:	0709 0a0b      	movepw %a1@(2571),%d3
    42a0:	0c0d           	.short 0x0c0d
    42a2:	0e10           	.short 0x0e10
    42a4:	1323           	moveb %a3@-,%a1@-
    42a6:	378f 0400      	movew %sp,%a3@(0,%d0:w:4)
    42aa:	0200 0080      	andib #-128,%d0
    42ae:	0064 0050      	oriw #80,%a4@-
    42b2:	0040 0030      	oriw #48,%d0
    42b6:	0020 0010      	orib #16,%a0@-
    42ba:	000e           	.short 0x000e
    42bc:	000c           	.short 0x000c
    42be:	000a           	.short 0x000a
    42c0:	0008           	.short 0x0008
    42c2:	0004 0002      	orib #2,%d4
    42c6:	0001 0c0c      	orib #12,%d1
    42ca:	0c0c           	.short 0x0c0c
    42cc:	0c0c           	.short 0x0c0c
    42ce:	0c0c           	.short 0x0c0c
    42d0:	0c0c           	.short 0x0c0c
    42d2:	0c0c           	.short 0x0c0c
    42d4:	1818           	moveb %a0@+,%d4
    42d6:	1818           	moveb %a0@+,%d4
    42d8:	1818           	moveb %a0@+,%d4
    42da:	1818           	moveb %a0@+,%d4
    42dc:	1818           	moveb %a0@+,%d4
    42de:	1818           	moveb %a0@+,%d4
    42e0:	2424           	movel %a4@-,%d2
    42e2:	2424           	movel %a4@-,%d2
    42e4:	2424           	movel %a4@-,%d2
    42e6:	2424           	movel %a4@-,%d2
    42e8:	2424           	movel %a4@-,%d2
    42ea:	2424           	movel %a4@-,%d2
    42ec:	2424           	movel %a4@-,%d2
    42ee:	2424           	movel %a4@-,%d2
    42f0:	2424           	movel %a4@-,%d2
    42f2:	2424           	movel %a4@-,%d2
    42f4:	2424           	movel %a4@-,%d2
    42f6:	2424           	movel %a4@-,%d2
    42f8:	2424           	movel %a4@-,%d2
    42fa:	2424           	movel %a4@-,%d2
    42fc:	2424           	movel %a4@-,%d2
    42fe:	2424           	movel %a4@-,%d2
    4300:	2424           	movel %a4@-,%d2
    4302:	2424           	movel %a4@-,%d2
    4304:	2424           	movel %a4@-,%d2
    4306:	2424           	movel %a4@-,%d2
    4308:	2424           	movel %a4@-,%d2
    430a:	2424           	movel %a4@-,%d2
    430c:	2424           	movel %a4@-,%d2
    430e:	2424           	movel %a4@-,%d2
    4310:	2424           	movel %a4@-,%d2
    4312:	2424           	movel %a4@-,%d2
    4314:	2424           	movel %a4@-,%d2
    4316:	2424           	movel %a4@-,%d2
    4318:	2424           	movel %a4@-,%d2
    431a:	2424           	movel %a4@-,%d2
    431c:	2424           	movel %a4@-,%d2
    431e:	2424           	movel %a4@-,%d2
    4320:	2424           	movel %a4@-,%d2
    4322:	2424           	movel %a4@-,%d2
    4324:	2424           	movel %a4@-,%d2
    4326:	2424           	movel %a4@-,%d2
    4328:	2424           	movel %a4@-,%d2
    432a:	2424           	movel %a4@-,%d2
    432c:	2400           	movel %d0,%d2
    432e:	0000 0000      	orib #0,%d0
    4332:	0000 0101      	orib #1,%d0
    4336:	0101           	btst %d0,%d1
    4338:	0101           	btst %d0,%d1
    433a:	0101           	btst %d0,%d1
    433c:	0101           	btst %d0,%d1
    433e:	0101           	btst %d0,%d1
    4340:	0202 0202      	andib #2,%d2
    4344:	0202 0202      	andib #2,%d2
    4348:	0202 0202      	andib #2,%d2
    434c:	0303           	btst %d1,%d3
    434e:	0303           	btst %d1,%d3
    4350:	0303           	btst %d1,%d3
    4352:	0303           	btst %d1,%d3
    4354:	0303           	btst %d1,%d3
    4356:	0303           	btst %d1,%d3
    4358:	0303           	btst %d1,%d3
    435a:	0303           	btst %d1,%d3
    435c:	0303           	btst %d1,%d3
    435e:	0303           	btst %d1,%d3
    4360:	0303           	btst %d1,%d3
    4362:	0303           	btst %d1,%d3
    4364:	0303           	btst %d1,%d3
    4366:	0303           	btst %d1,%d3
    4368:	0303           	btst %d1,%d3
    436a:	0303           	btst %d1,%d3
    436c:	0303           	btst %d1,%d3
    436e:	0303           	btst %d1,%d3
    4370:	0303           	btst %d1,%d3
    4372:	0303           	btst %d1,%d3
    4374:	0303           	btst %d1,%d3
    4376:	0303           	btst %d1,%d3
    4378:	0303           	btst %d1,%d3
    437a:	0303           	btst %d1,%d3
    437c:	0303           	btst %d1,%d3
    437e:	0303           	btst %d1,%d3
    4380:	0303           	btst %d1,%d3
    4382:	0303           	btst %d1,%d3
    4384:	0303           	btst %d1,%d3
    4386:	0303           	btst %d1,%d3
    4388:	0303           	btst %d1,%d3
    438a:	0303           	btst %d1,%d3
    438c:	0303           	btst %d1,%d3
    438e:	0303           	btst %d1,%d3
    4390:	0303           	btst %d1,%d3
    4392:	0303           	btst %d1,%d3
	...
    43a0:	fcfb           	.short 0xfcfb
    43a2:	ff01           	.short 0xff01
    43a4:	0203 0400      	andib #0,%d3
    43a8:	8000           	orb %d0,%d0
    43aa:	871d           	orb %d3,%a5@+
    43ac:	8f2f 97b7      	orb %d7,%sp@(-26697)
    43b0:	9fc4           	subal %d4,%sp
    43b2:	a9de           	.short 0xa9de
    43b4:	b505           	eorb %d2,%d5
    43b6:	bf49           	cmpmw %a1@+,%sp@+
    43b8:	cb31 d645      	andb %d5,%a1@(45,%a5:w:8)
    43bc:	e215           	roxrb #1,%d5
    43be:	f1a0           	.short 0xf1a0
    43c0:	0400 0200      	subib #0,%d0
    43c4:	0180           	bclr %d0,%d0
    43c6:	0140           	bchg %d0,%d0
    43c8:	0100           	btst %d0,%d0
    43ca:	00c0           	.short 0x00c0
    43cc:	00a0 0080 0078 	oril #8388728,%a0@-
    43d2:	0074 006e 0069 	oriw #110,%a4@(69,%d0:w)
    43d8:	0064 005a      	oriw #90,%a4@-
    43dc:	0046 0040      	oriw #64,%d6
    43e0:	0038 0030 0028 	orib #48,0x28
    43e6:	0020 001f      	orib #31,%a0@-
    43ea:	001e 001d      	orib #29,%fp@+
    43ee:	001c 001b      	orib #27,%a4@+
    43f2:	001a 0019      	orib #25,%a2@+
    43f6:	0018 0017      	orib #23,%a0@+
    43fa:	0016 0015      	orib #21,%fp@
    43fe:	0014 0013      	orib #19,%a4@
    4402:	0012 0011      	orib #17,%a2@
    4406:	0010 000f      	orib #15,%a0@
    440a:	000e           	.short 0x000e
    440c:	000d           	.short 0x000d
    440e:	000d           	.short 0x000d
    4410:	000c           	.short 0x000c
    4412:	000c           	.short 0x000c
    4414:	000b           	.short 0x000b
    4416:	000b           	.short 0x000b
    4418:	000a           	.short 0x000a
    441a:	000a           	.short 0x000a
    441c:	0009           	.short 0x0009
    441e:	0009           	.short 0x0009
    4420:	0008           	.short 0x0008
    4422:	0008           	.short 0x0008
    4424:	0008           	.short 0x0008
    4426:	0008           	.short 0x0008
    4428:	0007 0007      	orib #7,%d7
    442c:	0007 0007      	orib #7,%d7
    4430:	0006 0006      	orib #6,%d6
    4434:	0006 0006      	orib #6,%d6
    4438:	0005 0005      	orib #5,%d5
    443c:	0005 0005      	orib #5,%d5
    4440:	0004 0004      	orib #4,%d4
    4444:	0004 0004      	orib #4,%d4
    4448:	0004 0004      	orib #4,%d4
    444c:	0004 0004      	orib #4,%d4
    4450:	0004 0004      	orib #4,%d4
    4454:	0003 0004      	orib #4,%d3
    4458:	0004 0003      	orib #3,%d4
    445c:	0004 0004      	orib #4,%d4
    4460:	0003 0004      	orib #4,%d3
    4464:	0003 0004      	orib #4,%d3
    4468:	0003 0004      	orib #4,%d3
    446c:	0003 0004      	orib #4,%d3
    4470:	0003 0003      	orib #3,%d3
    4474:	0003 0003      	orib #3,%d3
    4478:	0003 0003      	orib #3,%d3
    447c:	0003 0003      	orib #3,%d3
    4480:	0003 0002      	orib #2,%d3
    4484:	0003 0003      	orib #3,%d3
    4488:	0003 0002      	orib #2,%d3
    448c:	0003 0003      	orib #3,%d3
    4490:	0002 0003      	orib #3,%d2
    4494:	0003 0002      	orib #2,%d3
    4498:	0003 0003      	orib #3,%d3
    449c:	0002 0003      	orib #3,%d2
    44a0:	0002 0003      	orib #3,%d2
    44a4:	0002 0003      	orib #3,%d2
    44a8:	0002 0003      	orib #3,%d2
    44ac:	0002 0003      	orib #3,%d2
    44b0:	0002 0002      	orib #2,%d2
    44b4:	0002 0002      	orib #2,%d2
    44b8:	0002 0002      	orib #2,%d2
    44bc:	0002 0002      	orib #2,%d2
    44c0:	0001 0002      	orib #2,%d1
    44c4:	0001 0002      	orib #2,%d1
    44c8:	0001 0002      	orib #2,%d1
    44cc:	0001 0002      	orib #2,%d1
    44d0:	0001 0001      	orib #1,%d1
    44d4:	0002 0001      	orib #1,%d2
    44d8:	0001 0001      	orib #1,%d1
    44dc:	0002 0001      	orib #1,%d2
    44e0:	0350           	bchg %d1,%a0@
	...
    44fe:	0000 0320      	orib #32,%d0
	...
    451e:	0000 02f2      	orib #-14,%d0
	...
    453e:	0000 02c8      	orib #-56,%d0
	...
    455e:	0000 02a0      	orib #-96,%d0
	...
    457e:	0000 0279      	orib #121,%d0
	...
    459e:	0000 0256      	orib #86,%d0
	...
    45be:	0000 0236      	orib #54,%d0
	...
    45de:	0000 0216      	orib #22,%d0
	...
    45fe:	0000 01f8      	orib #-8,%d0
	...
    461e:	0000 01dc      	orib #-36,%d0
	...
    463e:	0000 01c0      	orib #-64,%d0
	...
    465e:	0000 01a8      	orib #-88,%d0
	...
    467e:	0000 0190      	orib #-112,%d0
	...
    469e:	0000 0179      	orib #121,%d0
	...
    46be:	0000 0164      	orib #100,%d0
	...
    46de:	0000 0151      	orib #81,%d0
	...
    46fe:	0000 013e      	orib #62,%d0
	...
    471e:	0000 012c      	orib #44,%d0
	...
    473e:	0000 011b      	orib #27,%d0
	...
    475e:	0000 010b      	orib #11,%d0
	...
    477e:	0000 00fc      	orib #-4,%d0
	...
    479e:	0000 00ee      	orib #-18,%d0
	...
    47be:	0000 00e0      	orib #-32,%d0
	...
    47de:	0000 00d4      	orib #-44,%d0
	...
    47fe:	0000 00c8      	orib #-56,%d0
	...
    481e:	0000 00bd      	orib #-67,%d0
	...
    483e:	0000 00b2      	orib #-78,%d0
	...
    485e:	0000 00a8      	orib #-88,%d0
	...
    487e:	0000 009f      	orib #-97,%d0
	...
    489e:	0000 0096      	orib #-106,%d0
	...
    48be:	0000 008d      	orib #-115,%d0
	...
    48de:	0000 0086      	orib #-122,%d0
	...
    48fe:	0000 007e      	orib #126,%d0
	...
    491e:	0000 0078      	orib #120,%d0
	...
    493e:	0000 0071      	orib #113,%d0
	...
    495e:	0000 0071      	orib #113,%d0
	...
