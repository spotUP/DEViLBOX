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
