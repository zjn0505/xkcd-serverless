import { describe, test, expect, vi, beforeEach } from 'vitest';
import { FrCrawlerStrategy } from '../../src/strategies/fr_strategy';

globalThis.fetch = vi.fn() as any;

describe('FrCrawlerStrategy', () => {
    let strategy: FrCrawlerStrategy;

    beforeEach(() => {
        strategy = new FrCrawlerStrategy();
    });

    describe('fetchComic', () => {
        test('should correctly parse comic data', async () => {
          const mockHtml = `
            


<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>xkcd :: G locale</title>
  <meta name="author" content="Randall Munroe">
  <meta name="keywords" content="romance, amour, langage, informatique, humour, sarcasme, humour sarcastique, code, algorithme, langage grossier, gravité, sport">
  <meta name="description" content="Un webcomic sarcastique qui parle de romance, de maths et de langage, par Randall Munroe.">
  <meta name="traduction" content="Phiip">
  <meta name="Copyright" content="Lapin.org & Randall Munroe">
  <meta name="subject" content="humor"/>
  <meta name="publisher" content="Rabbit World Domination Compagny"/>
  <meta name="distribution" content="global"/>
  <meta name="classification" content="Tout public"/>
  <meta name="expires" content="never"/>
  <meta name="rating" content="humor"/>
  <meta name="robots" content="index, follow"/>
  <meta name="revisit-after" content="1 day"/>
  <meta name="Date-Creation-yyyymmdd" content="2009/12/16"/>
  <link rel="alternate" type="application/rss+xml" title="RSS 2.0" href="/fluxrss.xml" />
  <link rel="icon" href="favicon.ico" type="image/x-icon" />
  <link rel="shortcut icon" href="/static/favicon.ico" type="image/x-icon" />
  <link rel="stylesheet" type="text/css" href="/style.css" media="screen" title="Default" />
  <!--[if IE]><link rel="stylesheet" type="text/css" href="/ieonly.css" media="screen" title="Default" /><![endif]-->

</head>
<body>
  <div id="container">

    <div id="col1" class="dialog">

      <div id="banner">
        <div class="hd"><div class="c"></div></div><div class="bd"><div class="c"><div class="s">
          <h1><a href="index.php"><img src="images/xkcdLogo.png" alt="xkcd" /></a></h1>
          <p id="descriptor">Un webcomic sarcastique qui parle de romance, de maths et de langage, par Randall Munroe.</p>
		  <p id="origine">Traduit de <a href="http://xkcd.com">xkcd.com</a> par Sophie, Phiip et Antoine.</p>
        </div></div></div><div class="ft"><div class="c"></div></div>
      </div>

      <div id="content">
        <div class="hd"><div class="c"></div></div><div class="bd"><div class="c"><div class="s">
          <h2>G locale</h2>
          <div class="buttons"><ul>
            <li class="theme2"><a href='index.php?number=1#strips'><img src="images/debut.gif" class="img_nav" alt='premier' /></a></li>
            <li class="theme2"><a href='index.php?number=851#strips'><img src="images/avant.gif" class="img_nav" alt='<< précédent' /></a></li>
            <li class="theme2"><a href='index.php?number=853#strips'><img src="images/apres.gif" class="img_nav" alt='suivant >>' /></a></li>
            <li class="theme2"><a href='index.php?number=981#strips'><img src="images/dernier.gif" class="img_nav" alt='dernier' /></a></li>
          </ul></div>
          <div><a href='index.php?number=853'><img style='border:0; max-width: 100%;' alt="À Rio de Janeiro, en 2016, le même saut propulsera un athlète 0.25% plus haut (>1cm) qu'à Londres quatre ans avant." title="À Rio de Janeiro, en 2016, le même saut propulsera un athlète 0.25% plus haut (>1cm) qu'à Londres quatre ans avant." src="strips/852G-locale.png" /><br /><br /></a></div>
		  <div></div>
          <div class="buttons"><ul>
            <li class="theme2"><a href='index.php?number=1#strips'><img src="images/debut.gif" class="img_nav" alt='premier' /></a></li>
            <li class="theme2"><a href='index.php?number=851#strips'><img src="images/avant.gif" class="img_nav" alt='<< précédent' /></a></li>
            <li class="theme2"><a href='index.php?number=853#strips'><img src="images/apres.gif" class="img_nav" alt='suivant >>' /></a></li>
            <li class="theme2"><a href='index.php?number=981#strips'><img src="images/dernier.gif" class="img_nav" alt='dernier' /></a></li>
          </ul></div>
        </div></div></div><div class="ft"><div class="c"></div></div>
      </div>

      <div id="comms">
        <div class="hd"><div class="c"></div></div><div class="bd"><div class="c"><div class="s">
		  <br />
        <div>				<!-- AddThis Button BEGIN -->
<div class="addthis_toolbox addthis_default_style addthis_32x32_style">
<a class="addthis_button_google_plusone"/></a>
<a class="addthis_button_preferred_1"></a>
<a class="addthis_button_preferred_2"></a>
<a class="addthis_button_preferred_3"></a>
<a class="addthis_button_preferred_4"></a>
<a class="addthis_button_compact"></a>
<a class="addthis_counter addthis_bubble_style"></a> 
&nbsp;<a href="https://xkcd.lapin.org/fluxrss.xml"><img src="https://lapin.org/logos/xml.gif" alt="le flux RSS de xkcd" border="0"></a>
</div>
<script type="text/javascript">var addthis_config = {"data_track_clickback":true};</script>
<script type="text/javascript" src="https://s7.addthis.com/js/250/addthis_widget.js#pubid=Phiip"></script>
<!-- AddThis Button END -->
<br />
		  <table id='comms_table'><tr><td><a href='index.php?comms=yes&amp;number=852#comments'>Mettre le premier commentaire</a></td></tr></table><br></div>
        </div></div></div><div class="ft"><div class="c"></div></div>
      </div>
	  
	  <div id="recherche">
        <div class="hd"><div class="c"></div></div><div class="bd"><div class="c"><div class="s">
		        </div></div></div><div class="ft"><div class="c"></div></div>
      </div>  
	  
	  
      <div id="foot">
        <div class="hd"><div class="c"></div></div><div class="bd"><div class="c"><div class="s">
		<p>Le strip original : <a href="http://xkcd.com/852" title="">http://xkcd.com/852</a></p><br>
		<p>Traduit par Phiip jusqu'au 150, puis par Antoine.</p>
<p>Si vous êtes pressés, vous pouvez aller voir <a href="http://xkcd.free.fr/" title="traductions d'xkcd aussi">le travail de l'équipe d'xkcd.free.fr pour une traduction collaborative de tous les strips</a>, mais en texte simple.</p>
	<br /><p>Attention&nbsp;: ce webcomic contient de temps en temps un langage grossier (qui peut être inadapté pour un enfant), un humour inhabituel (qui peut être 
inadapté pour un adulte), et des maths avancées (qui peuvent être inadaptées pour un étudiant en licence scientifique).</p>
	<h4>Nous n'avons pas inventé l'algorithme. L'algorithme trouve invariablement Jésus. L'algorithme a tué Jeeves.<br /> L'algorithme est banni en Chine. 
L'algorithme vient de Jersey. L'algorithme trouve invariablement Jésus.<br />Ceci n'est pas l'algorithme. Ceci en est proche.</h4>
	<div class="line"></div>

        <p id="licenseText"><br/>
	    <div><a rel="license" href="http://creativecommons.org/licenses/by-nc/2.5/">
		<img alt="Creative Commons License" style="border:none" src="http://imgs.xkcd.com/static/somerights20.png" />
	    </a></div>
Ce travail est propose sous une licence <br/><a rel="license" href="http://creativecommons.org/licenses/by-nc/2.5/">Créative Commons Attribution-NonCommercial 
2.5</a>.<br />
<rdf:RDF xmlns="http://web.resource.org/cc/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<License rdf:about="http://creativecommons.org/licenses/by-nc/2.5/">
<permits 
rdf:resource="http://web.resource.org/cc/Reproduction" /><permits 
rdf:resource="http://web.resource.org/cc/Distribution" /><requires 
rdf:resource="http://web.resource.org/cc/Notice" /><requires 
rdf:resource="http://web.resource.org/cc/Attribution" /><prohibits 
rdf:resource="http://web.resource.org/cc/CommercialUse" /><permits 
rdf:resource="http://web.resource.org/cc/DerivativeWorks" 
/></License></rdf:RDF>
Cela signifie que vous êtes libres de copier et partager ces webcomics<br /> (mais pas les vendre)
<a href="http://xkcd.com/license.html">Plus de détails (en anglais)</a>.<br/>

        </p>


	<hr />
        <h2>Mini menu</h2><!-- le menu ligne complet -->
<div class="navigation">

<a href="https://lapin.org/">Maison</a> - 
<a href="https://lapin.org/les_derniers_strips/" title="des heures de lecture">Tous les webcomics</a> - 
<a href="https://librairie.lapin.org/" title="les bandes dessinées de lapin en papier !">La librairie Lapin</a> - 
<a href="https://librairie.lapin.org/content/2-mentions-legales" title="la loi">Mentions légales et RGPD</a> - 
<a href="mailto:contact@lapin.org?subject=bonjour_les_lapins" title="nous écrire">Contact</a>
</div>
        </div></div></div><div class="ft"><div class="c"></div></div>
      </div>

    </div><!-- col1 -->

    <div id="col2" class="dialog">

      <div id="portail">
        <div class="hd"><div class="c"></div></div><div class="bd"><div class="c"><div class="s">
          <div style="width:187px; background: transparent; overflow: hidden; float:right; display: block">
    <ul style="list-style-type: none; padding:0px; margin:0px; border:0; background:transparent" >
	<li style="background:transparent;margin:0;padding:0;border:0;height:40px; width:187px;">
		<a style="border:0;padding:0;margin:0;font-size:7px" href="https://lapin.org" title="Retour a la page d'accueil de lapin.org">
		<img style="border:0;padding:0;margin:0;height:40px; width:187px;"
			 src="https://lapin.lapin.org/public/images/portail/retour-portail.png" alt="Retour au portail LAPIN" /></a>
	</li>
	<li style="background:transparent;padding:0;margin:0;border:0;height:22px;width:187px;padding:0">
		<a style="border:0;margin:0;padding:0;font-size:7px;background:transparent;width:187px;" href="https://librairie.lapin.org" title="Pour commander vos webcomics Lapin flambant neuf">
		<img style="border:0;padding:0;margin:0;height:22px;width:187px;"
			src="https://lapin.lapin.org/public/images/portail/librairie.png" alt="La librairie Lapin" /></a>
	</li>

	<li style="background: white; padding:0;margin:0;padding-top:2;border:0">
		<ul style="list-style-type:none;padding:0;margin:0"><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://lapin.lapin.org/index.php" title="Lapin"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35lapin.png" alt="Lapin" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://oglaf.lapin.org/index.php" title="Oglaf"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35oglaf.gif" alt="Oglaf" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://cereales.lapin.org/index.php" title="Les Céréales du Dimanche Matin"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35cereales.png" alt="Les Céréales du Dimanche Matin" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://seb.lapin.org//index.php" title="Sebh"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35seb.png" alt="Sebh" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://absurdo.lapin.org//index.php" title="ab absurdo"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35absurdo.jpg" alt="ab absurdo" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://fifike.lapin.org/index.php" title="Fifike"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35fifike.png" alt="Fifike" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://xkcd.lapin.org/index.php" title="xkcd"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35xkcd.png" alt="xkcd" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://lignes.lapin.org//index.php" title="des Lignes mal Dessinées"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35lignes.gif" alt="des Lignes mal Dessinées" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://big.lapin.org//index.php" title="Big"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/comics/90big.jpg" alt="Big" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://buni.lapin.org/index.php" title="Buni"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35buni.png" alt="Buni" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://comics.lapin.org/pokestrip//index.php" title="pokestrip"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35pokestrip.jpg" alt="pokestrip" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://jesus.lapin.org//index.php" title="Jesus Sixte"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35jesus.jpg" alt="Jesus Sixte" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://docteur.lapin.org/index.php" title="Docteur Fun"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35docteur.png" alt="Docteur Fun" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://doris.lapin.org/index.php" title="Dorris McComics"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35doris.png" alt="Dorris McComics" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://comics.lapin.org/space//index.php" title="space dementia"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35spacex.jpg" alt="space dementia" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://noe.lapin.org/index.php" title="Noé"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35noe.png" alt="Noé" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://mouton.lapin.org/index.php" title="Gordon le Mouton"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35gordon.png" alt="Gordon le Mouton" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://striptyx.lapin.org/index.php" title="Striptyx"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35striptyx.jpg" alt="Striptyx" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://plage.lapin.org//index.php" title="L'amour à la plage"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35plage.jpg" alt="L'amour à la plage" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://batons.lapin.org//index.php" title="Meanwhile"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/comics/90meanwhile.jpg" alt="Meanwhile" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://langues.lapin.org//index.php" title="Les Langues Pendues"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35langues.jpg" alt="Les Langues Pendues" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://objet.lapin.org/index.php" title="Compliment d'objet"><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35objet.png" alt="Compliment d'objet" /></a></li></ul></li>
	<li style="background: white;padding:0;margin:0;border:0">
		<ul style="list-style-type:none;padding:0;margin:0"><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;line-height:normal;background:transparent" href="http://chroniques.lapin.org/index.php" title="Les Chroniques" ><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35chroniques.png" alt="Les Chroniques" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;line-height:normal;background:transparent" href="http://maximi.lapin.org/index.php" title="Maximi le Clown" ><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35maximi.png" alt="Maximi le Clown" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;line-height:normal;background:transparent" href="http://police.lapin.org/index.php" title="Jerry Stobbart" ><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35jerry.png" alt="Jerry Stobbart" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;line-height:normal;background:transparent" href="http://guerre.lapin.org/index.php" title="AMD 3 - La Guerre du Destin" ><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35guerre.gif" alt="AMD 3 - La Guerre du Destin" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;line-height:normal;background:transparent" href="http://destin.lapin.org/index.php" title="Une Modeste Destinée" ><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35destin.png" alt="Une Modeste Destinée" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;line-height:normal;background:transparent" href="http://elftor.lapin.org/index.php" title="Elftor" ><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35elftor.png" alt="Elftor" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;line-height:normal;background:transparent" href="http://propheties.lapin.org/index.php" title="AMD4 - Les prophéties" ><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/minis/35propheties.png" alt="AMD4 - Les prophéties" /></a></li><li style="float:left; width:35; height:35; margin-left:2; margin-bottom:2;"><a style="border:0; padding:0;margin:0;background:transparent" href="http://destin.lapin.org/index.php" title="Un webcomics au hasard" ><img style="border:0;padding:0;margin:0" width="35" height="35" src="https://lapin.lapin.org/public/images/portail/interrogation-blanc.png" alt="???" /></a></li><li style="clear:left"></li></ul></li>
    </ul>
</div>
        </div></div></div><div class="ft"><div class="c"></div></div>
      </div>
      <div id="pub lapin">
        <div class="hd"><div class="c"></div></div><div class="bd"><div class="c"><div class="s">
				<!-- annonces lapin -->
		<div><a href="https://librairie.lapin.org" title="La librairie Lapin c’est le bien"><img src="https://lapin.lapin.org/public/pubs/pave_lapin.jpg" width="200px" height="300px" alt="La librairie lapin propose tous les livres des éditions lapin et des tas d’objets sympas comme des mugs, des cartes postales, des t-shirts etc." /></a></div>		<!-- annonces lapin -->
        </div></div></div><div class="ft"><div class="c"></div></div>
      </div>
      <div id="navigation">
        <div class="hd"><div class="c"></div></div><div class="bd"><div class="c"><div class="s">
	  <h3>Episodes</h3>
          1. <a href='index.php?number=1'>Le Tonneau, première partie</a>&nbsp;&nbsp;<br /><p><font size="4">(...)</font></p>426. <a href='index.php?number=426'>Géohachage</a>&nbsp;&nbsp;<br /><p><font size="4">(...)</font></p>850. <a href='index.php?number=850'>Le monde selon les Américains</a>&nbsp;&nbsp;<br />851. <a href='index.php?number=851'>Na</a>&nbsp;&nbsp;<br /><b>852. <a href='index.php?number=852'>G locale</a>&nbsp;&nbsp;</b><br />853. <a href='index.php?number=853'>Voyelles consécutives</a>&nbsp;&nbsp;<br />854. <a href='index.php?number=854'>Apprendre à cuisiner</a>&nbsp;&nbsp;<br /><p><font size="4">(...)</font></p>916. <a href='index.php?number=916'>Indémontable</a>&nbsp;&nbsp;<br /><p><font size="4">(...)</font></p>981. <a href='index.php?number=981'>Dossier porno</a>&nbsp;&nbsp;<br /><a href='index.php?show_all=yes&amp;number=852'><i></i></a>	  <h3><a href="tous-episodes.php">Tous les strips</a></h3>
	<h3>histoires</h3>
         <b>En cours :</b>
                <a href="stories.php?number=12">Persévérons </a><br/><br/><i> <a href='index.php?number=601'>Début de l'histoire</a><br/></i><a href='index.php?number=505'>Histoire précédente</a>                <br><br>
        <h3><a href="stories.php" title="les histoires">toutes les histoires</a></h3>
		        </div></div></div><div class="ft"><div class="c"></div></div>
      </div>


      <div id="liens">
        <div class="hd"><div class="c"></div></div><div class="bd"><div class="c"><div class="s">
	  <h3>Liens</h3>
          <ul></ul>        </div></div></div><div class="ft"><div class="c"></div></div>
      </div>

      <div id="xiti">
        <div class="hd"><div class="c"></div></div><div class="bd"><div class="c"><div class="s">
          <!-- xtreme et xiti -->
                    <!-- fin code xiti et xtreme -->
        </div></div></div><div class="ft"><div class="c"></div></div>
      </div>

    </div><!-- col2 -->

  </div><!-- container -->
</body>
          `;
    
          (fetch as any).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(mockHtml)
          });
    
          const result = await strategy.fetchComic(852);
    
          expect(result).toEqual({
            id: 852,
            title: 'G locale',
            imageUrl: 'https://xkcd.lapin.org/strips/852G-locale.png',
            altText: "À Rio de Janeiro, en 2016, le même saut propulsera un athlète 0.25% plus haut (>1cm) qu'à Londres quatre ans avant.",
            originalUrl: 'https://xkcd.lapin.org/index.php?number=852'
          });
        });
      });
});