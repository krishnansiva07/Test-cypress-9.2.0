import { web_url } from '../variables/variables.js'

import { home_page_locators } from '../variables/locators.js';

export default class HomePage {

	goToUrl(url){
		cy.visit(url);
	}

	goToHomePage(){
		cy.visit(web_url);
	}


	performLogin(userName,password){
		cy.get(home_page_locators['username'],{force:true}).type(userName)
		cy.get(home_page_locators['password'],{force:true}).type(password)
		cy.get(home_page_locators['submitbutton']).click()
	}

	

	
	
}